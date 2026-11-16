import type { Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { Offer, type IOffer } from "../models/offer.model";
import { isAcceptingOffers, Tender, type ITender } from "../models/tender.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { notifyNewOffer, openTendersFor } from "../utils/tenders";
import { deleteFromSpaces, uploadToSpaces } from "../utils/uploadToSpaces";

// The signed-in supplier's Open Tenders and quotes (briefing §4.5–4.6,
// Master Briefing v4: every open tender in its country and trades, plus the
// ones it was alerted about before). Signed in, it sees the hotel and email.

/** What the supplier sees as the status of an invitation. */
function supplierStatus(tender: Pick<ITender, "status" | "deadline">, offer?: Pick<IOffer, "status"> | null) {
  if (tender.status === "cancelled" || tender.status === "closed") return "cancelled";
  if (offer) return offer.status; // submitted / won / lost
  if (tender.status === "awarded") return "lost";
  return isAcceptingOffers(tender) ? "open" : "expired";
}

const forMe = (req: Request) => ({ $or: [{ invitedSuppliers: req.supplier!._id }, openTendersFor(req.supplier!)] });

const HOTEL_FIELDS = "name city emails.general";

/** The supplier's view: no other suppliers, no other quotes. */
function present(tender: ITender & { hotel: unknown }, offer?: IOffer | null) {
  const { invitedSuppliers: _invited, winner: _winner, hotel, ...rest } = tender as ITender & Record<string, unknown>;
  const h = hotel as unknown as { _id: unknown; name: string; city: string; emails?: { general?: string } } | null;
  return {
    ...rest,
    hotel: h && { _id: h._id, name: h.name, city: h.city },
    contactEmail: tender.contactEmail || h?.emails?.general || "",
    acceptingOffers: isAcceptingOffers(tender),
    myStatus: supplierStatus(tender, offer),
    myOffer: offer ?? null,
  };
}

export const listInvitations = asyncHandler(async (req: Request, res: Response) => {
  const tenders = await Tender.find(forMe(req)).populate("hotel", HOTEL_FIELDS).sort({ createdAt: -1 }).lean();
  const offers = await Offer.find({ supplier: req.supplier!._id, tender: { $in: tenders.map((t) => t._id) } })
    .select("-file.key")
    .lean();
  const byTender = new Map(offers.map((o) => [String(o.tender), o]));
  return ApiResponse(
    res,
    200,
    "Invitations fetched successfully",
    tenders.map((t) => present(t as never, byTender.get(String(t._id)) as never))
  );
});

export const getInvitation = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...forMe(req) }).populate("hotel", HOTEL_FIELDS).lean();
  if (!tender) throw new ApiError(404, "Request not found");
  const offer = await Offer.findOne({ tender: tender._id, supplier: req.supplier!._id }).select("-file.key").lean();
  return ApiResponse(res, 200, "Request fetched successfully", present(tender as never, offer as never));
});

/**
 * PUT /supplier-tenders/:id/offer (multipart) — send or change the quote
 * until the deadline. The hotel is emailed the first time.
 */
export const submitOffer = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...forMe(req) });
  if (!tender) throw new ApiError(404, "Request not found");
  if (!isAcceptingOffers(tender)) throw new ApiError(409, "This request no longer accepts quotes");

  let offer = await Offer.findOne({ tender: tender._id, supplier: req.supplier!._id });
  const isNew = !offer;
  offer ??= new Offer({ tender: tender._id, supplier: req.supplier!._id });

  offer.set({
    price: req.body.price,
    deliveryWeeks: Number(req.body.deliveryWeeks),
    notes: req.body.notes ?? "",
  });
  if (req.file) {
    const oldKey = offer.file?.key;
    const uploaded = await uploadToSpaces(req.file, "offers");
    offer.file = { url: uploaded.url, key: uploaded.key, name: uploaded.name };
    await deleteFromSpaces(oldKey);
  }
  await offer.save();

  if (isNew) {
    const hotel = await Hotel.findById(tender.hotel).select("name emails").lean();
    if (hotel) await notifyNewOffer(tender, hotel, req.supplier!.name);
  }
  return ApiResponse(res, isNew ? 201 : 200, isNew ? "Quote sent" : "Quote updated", offer);
});
