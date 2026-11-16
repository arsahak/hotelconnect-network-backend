import crypto from "crypto";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { Partner } from "../models/partner.model";
import { Supplier } from "../models/supplier.model";
import { notifySupplier } from "./notify";
import { languageFor, supplierInvite } from "./emailTemplates";
import { sendEmail } from "./sendEmail";

/** One invite email per supplier per day. */
const RESEND_AFTER_MS = 24 * 60 * 60 * 1000;

type InviteHotel = { _id: Types.ObjectId | unknown; name: string; city: string; country?: string };

/**
 * 1-click invite (Master Briefing v4, email 6.2). A supplier already on the
 * platform (same email) becomes a partner at once; otherwise it gets the
 * invite with a sign-up link (free until 1 May 2028).
 */
export async function inviteSupplier(hotel: InviteHotel, input: { email: string; company: string; contract?: string | null }) {
  const email = input.email.trim().toLowerCase();
  let partner = await Partner.findOne({ hotel: hotel._id, email }).select("+token");
  if (partner?.status === "active") return { partner, sent: false, already: true };
  if (partner && Date.now() - partner.invitedAt.getTime() < RESEND_AFTER_MS) return { partner, sent: false, already: false, tooSoon: true };

  partner ??= new Partner({ hotel: hotel._id, email, token: crypto.randomBytes(24).toString("hex") });
  partner.set({ company: input.company || partner.company, contract: input.contract ?? partner.contract, invitedAt: new Date() });

  const existing = await Supplier.findOne({ isActive: true, $or: [{ "contact.email": email }, { "emails.notifications": email }] }).select("_id name");
  if (existing) {
    partner.set({ supplier: existing._id, status: "active", acceptedAt: new Date() });
    await partner.save();
    await notifySupplier(String(existing._id), {
      type: "system",
      title: `${hotel.name} added you as a trusted partner`,
      body: `${hotel.name} (${hotel.city}) now shows under My Partner Hotels.`,
      link: "/supplier/partners",
    });
    return { partner, sent: false, already: false, linked: true };
  }

  await partner.save();
  const link = `${env.websiteUrl}/register?type=supplier&invite=${partner.token}`;
  // Email 6.2, in the hotel's language.
  const mail = supplierInvite(languageFor({ country: hotel.country }), { hotelName: hotel.name, city: hotel.city, inviteLink: link });
  await sendEmail({ to: email, subject: mail.subject, html: mail.html, from: mail.from }).catch((error) =>
    console.error("[partners] invite email failed:", error instanceof Error ? error.message : error)
  );
  return { partner, sent: true, already: false };
}

/** A new supplier was approved: its invites (by token or by email) become partner links. */
export async function acceptInvites(supplierId: Types.ObjectId | unknown, email: string, token?: string) {
  const or: Record<string, unknown>[] = [{ email: email.toLowerCase() }];
  if (token) or.push({ token });
  await Partner.updateMany({ supplier: null, $or: or }, { $set: { supplier: supplierId, status: "active", acceptedAt: new Date() } });
}
