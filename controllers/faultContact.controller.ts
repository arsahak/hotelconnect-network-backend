import type { Request, Response } from "express";
import { FaultContact } from "../models/faultContact.model";
import { Hotel } from "../models/hotel.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { pick } from "../utils/pick";
import { notifyHotel } from "../utils/notify";
import { escapeHtml, sendEmail } from "../utils/sendEmail";

// Storingslijst of the signed-in hotel (briefing §3.4.3). Managers edit it;
// the hotel's staff login can only read it and report faults.

const EDITABLE = ["name", "faultType", "phone", "whatsapp", "email", "website", "notes"] as const;
const mine = (req: Request) => ({ hotel: req.user!.hotel });

export const listFaultContacts = asyncHandler(async (req: Request, res: Response) => {
  const contacts = await FaultContact.find(mine(req)).sort({ faultType: 1, name: 1 }).lean();
  return ApiResponse(res, 200, "Fault contacts fetched successfully", contacts);
});

export const getFaultContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await FaultContact.findOne({ _id: req.params.id, ...mine(req) }).lean();
  if (!contact) throw new ApiError(404, "Contact not found");
  return ApiResponse(res, 200, "Fault contact fetched successfully", contact);
});

export const createFaultContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await FaultContact.create({ ...pick(req.body, EDITABLE), ...mine(req) });
  return ApiResponse(res, 201, "Contact added successfully", contact);
});

export const updateFaultContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await FaultContact.findOne({ _id: req.params.id, ...mine(req) });
  if (!contact) throw new ApiError(404, "Contact not found");
  contact.set(pick(req.body, EDITABLE));
  await contact.save();
  return ApiResponse(res, 200, "Contact saved successfully", contact);
});

export const deleteFaultContact = asyncHandler(async (req: Request, res: Response) => {
  const contact = await FaultContact.findOneAndDelete({ _id: req.params.id, ...mine(req) });
  if (!contact) throw new ApiError(404, "Contact not found");
  return ApiResponse(res, 200, "Contact deleted successfully");
});

/**
 * Report a fault (briefing §3.4.3, addition): emails the party with the
 * hotel's contact details, so they get in touch with the hotel directly.
 * HotelConnect does not store or follow up the report.
 */
export const reportFault = asyncHandler(async (req: Request, res: Response) => {
  const contact = await FaultContact.findOne({ _id: req.params.id, ...mine(req) }).lean();
  if (!contact) throw new ApiError(404, "Contact not found");
  if (!contact.email) throw new ApiError(422, "This contact has no email address. Please call them.");

  const hotel = await Hotel.findById(req.user!.hotel).lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const { description, location, urgent } = req.body as { description?: string; location?: string; urgent?: boolean };
  const replyTo = hotel.emails.faults || hotel.emails.general;
  const reporter = [req.user!.firstName, req.user!.lastName].filter(Boolean).join(" ");

  const rows = [
    ["Hotel", `${hotel.name} (${hotel.memberNumber})`],
    ["Address", hotel.address],
    ["Contact person", hotel.contactPerson || reporter],
    ["Phone", hotel.phone || "—"],
    ["Email", replyTo],
    ["Type of fault", contact.faultType],
    ["Where in the hotel", location || "—"],
  ]
    .map(([label, value]) => `<tr><td style="padding:4px 16px 4px 0;color:#6f665b">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join("");

  await sendEmail({
    to: contact.email,
    subject: `${urgent ? "URGENT – " : ""}Fault report: ${contact.faultType} at ${hotel.name}`,
    replyTo,
    html: `
      <p>Dear ${escapeHtml(contact.name)},</p>
      <p>${escapeHtml(hotel.name)} reports a fault${urgent ? " and asks for an <strong>urgent</strong> response" : ""}. Please contact the hotel directly.</p>
      <table style="border-collapse:collapse">${rows}</table>
      ${description ? `<p style="margin-top:16px;white-space:pre-line">${escapeHtml(description)}</p>` : ""}
      <p style="color:#6f665b;font-size:12px;margin-top:16px">Sent through HotelConnect. Reply to this email to reach the hotel.</p>
    `,
  });

  await notifyHotel(
    String(hotel._id),
    {
      type: "fault",
      title: `${urgent ? "URGENT – " : ""}Fault reported to ${contact.name}`,
      body: `${contact.faultType}${location ? ` · ${location}` : ""}. Reported by ${reporter}.`,
      link: `/hotel/faults/${contact._id}`,
    },
    {
      to: replyTo,
      subject: `Copy: fault reported to ${contact.name}`,
      html: `<p>${escapeHtml(reporter)} reported a fault (${escapeHtml(contact.faultType)}) to ${escapeHtml(contact.name)} through HotelConnect.</p>${description ? `<p style="white-space:pre-line">${escapeHtml(description)}</p>` : ""}`,
    }
  );

  return ApiResponse(res, 200, "The fault was reported to the contact");
});
