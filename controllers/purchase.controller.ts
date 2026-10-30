import type { Request, Response } from "express";
import archiver from "archiver";
import { isJoinable, PurchaseAction } from "../models/purchaseAction.model";
import { PurchaseParticipation } from "../models/purchaseParticipation.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { pick } from "../utils/pick";
import { notifyParticipants, participantCounts } from "../utils/purchasing";
import { slugify } from "../utils/slugify";
import { deletePrivate, readPrivate, uploadPrivate } from "../utils/uploadToSpaces";

// Collectieve inkoop (briefing §3.13).

const ORDER = { open: 0, negotiating: 1, completed: 2 } as const;

// ── Hotel managers ───────────────────────────────────────────────────────────

/** Every action with its participant count and the hotel's own participation. */
export const listActions = asyncHandler(async (req: Request, res: Response) => {
  const actions = await PurchaseAction.find().sort({ deadline: -1 }).lean();
  const [counts, mine] = await Promise.all([
    participantCounts(actions.map((a) => a._id)),
    PurchaseParticipation.find({ hotel: req.user!.hotel, action: { $in: actions.map((a) => a._id) } })
      .select("-invoice.key")
      .lean(),
  ]);
  const byAction = new Map(mine.map((p) => [String(p.action), p]));
  const items = actions
    .map((a) => ({
      ...a,
      participants: counts.get(String(a._id)) ?? 0,
      joinable: isJoinable(a),
      myParticipation: byAction.get(String(a._id)) ?? null,
    }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return ApiResponse(res, 200, "Actions fetched successfully", items);
});

/**
 * POST /purchasing/:id/join (multipart, field "invoice") — join with the latest
 * annual invoice. At the target number of hotels the status turns to "negotiating".
 */
export const joinAction = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.findById(req.params.id);
  if (!action) throw new ApiError(404, "Action not found");
  if (!isJoinable(action)) throw new ApiError(409, "This action is no longer open");
  if (!req.file) throw new ApiError(422, "Upload your latest annual invoice (PDF)");
  if (await PurchaseParticipation.exists({ action: action._id, hotel: req.user!.hotel })) {
    throw new ApiError(409, "Your hotel already takes part");
  }

  const invoice = await uploadPrivate(req.file, `purchasing/${action._id}`);
  const participation = await PurchaseParticipation.create({
    action: action._id,
    hotel: req.user!.hotel,
    currentSupplier: req.body.currentSupplier,
    contractEndDate: req.body.contractEndDate,
    annualUsage: req.body.annualUsage ?? "",
    invoice,
  });

  const count = await PurchaseParticipation.countDocuments({ action: action._id });
  if (count >= action.targetParticipants && action.status === "open") {
    action.status = "negotiating";
    await action.save();
    await notifyParticipants(
      action._id,
      `${action.title}: negotiations started`,
      `${count} hotels joined. HotelConnect now negotiates with suppliers; you hear the result here.`
    );
  }
  return ApiResponse(res, 201, "You take part", participation);
});

/** DELETE /purchasing/:id/join — withdraw while the action is open. */
export const withdrawAction = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.findById(req.params.id).select("status").lean();
  if (!action) throw new ApiError(404, "Action not found");
  if (action.status !== "open") throw new ApiError(409, "You can only withdraw while the action is open");
  const participation = await PurchaseParticipation.findOneAndDelete({ action: action._id, hotel: req.user!.hotel });
  if (!participation) throw new ApiError(404, "Your hotel does not take part");
  await deletePrivate(participation.invoice?.key);
  return ApiResponse(res, 200, "You withdrew");
});

// ── Admins ───────────────────────────────────────────────────────────────────

const ACTION_EDITABLE = ["title", "category", "description", "deadline", "expectedSavings", "targetParticipants", "status"] as const;

export const adminListActions = asyncHandler(async (_req: Request, res: Response) => {
  const actions = await PurchaseAction.find().sort({ createdAt: -1 }).lean();
  const counts = await participantCounts(actions.map((a) => a._id));
  return ApiResponse(res, 200, "Actions fetched successfully", actions.map((a) => ({ ...a, participants: counts.get(String(a._id)) ?? 0 })));
});

export const adminGetAction = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.findById(req.params.id).lean();
  if (!action) throw new ApiError(404, "Action not found");
  const participants = await PurchaseParticipation.find({ action: action._id })
    .select("-invoice.key")
    .populate("hotel", "name memberNumber city")
    .sort({ createdAt: 1 })
    .lean();
  return ApiResponse(res, 200, "Action fetched successfully", { ...action, participants });
});

export const adminCreateAction = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.create(pick(req.body, ACTION_EDITABLE));
  return ApiResponse(res, 201, "Action created", action);
});

/** Marking "completed" starts the 90-day countdown for deleting the invoices. */
export const adminUpdateAction = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.findById(req.params.id);
  if (!action) throw new ApiError(404, "Action not found");
  const before = action.status;
  action.set(pick(req.body, ACTION_EDITABLE));
  if (action.status === "completed" && before !== "completed") action.completedAt = new Date();
  if (action.status !== "completed") action.completedAt = null;
  await action.save();
  if (before !== action.status && action.status === "completed") {
    await notifyParticipants(action._id, `${action.title}: completed`, "The collective purchase is completed. Check your email for the offer.");
  }
  return ApiResponse(res, 200, "Action saved", action);
});

export const adminDeleteAction = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.findById(req.params.id);
  if (!action) throw new ApiError(404, "Action not found");
  const participations = await PurchaseParticipation.find({ action: action._id });
  await Promise.all(participations.map((p) => deletePrivate(p.invoice?.key)));
  await PurchaseParticipation.deleteMany({ action: action._id });
  await action.deleteOne();
  return ApiResponse(res, 200, "Action deleted");
});

const invoiceName = (hotel: { memberNumber?: string; name?: string }) =>
  `${hotel.memberNumber ?? "hotel"}-${slugify(hotel.name ?? "invoice")}.pdf`;

/** GET /purchasing/admin/:id/zip — every invoice of the action in one ZIP, for the energy supplier. */
export const adminDownloadZip = asyncHandler(async (req: Request, res: Response) => {
  const action = await PurchaseAction.findById(req.params.id).lean();
  if (!action) throw new ApiError(404, "Action not found");
  const participations = await PurchaseParticipation.find({ action: action._id, invoice: { $ne: null } })
    .populate<{ hotel: { name: string; memberNumber: string } }>("hotel", "name memberNumber")
    .lean();
  if (!participations.length) throw new ApiError(404, "There are no invoices to download");

  // Read everything first, so an error still becomes a normal JSON error.
  const files = await Promise.all(
    participations.map(async (p) => ({ name: invoiceName(p.hotel), data: await readPrivate(p.invoice!.key) }))
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${slugify(action.title)}-invoices.zip"`);
  const zip = archiver("zip", { zlib: { level: 6 } });
  zip.on("error", (err) => res.destroy(err));
  zip.pipe(res);
  for (const file of files) zip.append(file.data, { name: file.name });
  await zip.finalize();
});

/** GET /purchasing/admin/:id/participants/:pid/invoice — one invoice. */
export const adminDownloadInvoice = asyncHandler(async (req: Request, res: Response) => {
  const p = await PurchaseParticipation.findOne({ _id: req.params.pid, action: req.params.id })
    .populate<{ hotel: { name: string; memberNumber: string } }>("hotel", "name memberNumber")
    .lean();
  if (!p?.invoice) throw new ApiError(404, "Invoice not found");
  const data = await readPrivate(p.invoice.key);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoiceName(p.hotel)}"`);
  res.send(data);
});

// Hotels that are deleted leave nothing behind (see hotel.controller deleteHotel).
export async function deleteHotelParticipations(hotelId: unknown) {
  const participations = await PurchaseParticipation.find({ hotel: hotelId });
  await Promise.all(participations.map((p) => deletePrivate(p.invoice?.key)));
  await PurchaseParticipation.deleteMany({ hotel: hotelId });
}
