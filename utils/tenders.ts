import { env } from "../config/env";
import { TENDER_MAX_SUPPLIERS } from "../config/constants";
import type { IHotel } from "../models/hotel.model";
import { Supplier } from "../models/supplier.model";
import type { ITender } from "../models/tender.model";
import { User } from "../models/user.model";
import { notifyHotel, notifySupplier } from "./notify";
import { escapeHtml } from "./sendEmail";

const NATIONWIDE = "All of the Netherlands";

/**
 * Briefing §3.5: a tender goes to at most three active suppliers with the
 * tender's category and region (or the whole country). Suppliers with a
 * login come first, since only they can send a quote; then the best rated
 * (briefing §3.8). A little randomness spreads the work between suppliers
 * with about the same score.
 */
export async function pickSuppliers(category: string, region: string) {
  const candidates = await Supplier.find({
    isActive: true,
    categories: category,
    regions: { $in: [region, NATIONWIDE] },
  })
    .select("_id name contact emails rating")
    .lean();
  if (!candidates.length) return [];

  const withLogin = new Set(
    (await User.distinct("supplier", { role: "supplier", isActive: true, supplier: { $in: candidates.map((s) => s._id) } })).map(String)
  );
  return candidates
    .map((supplier) => ({
      supplier,
      rank: (withLogin.has(String(supplier._id)) ? 0 : 10) + (5 - (supplier.rating?.score ?? 3.5)) + Math.random() * 0.75,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, TENDER_MAX_SUPPLIERS)
    .map(({ supplier }) => supplier);
}

const formatDate = (date: Date) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const button = (href: string, label: string) =>
  `<p style="margin-top:16px"><a href="${href}" style="color:#9f7b3b">${label}</a></p>`;

type SupplierContact = { _id: unknown; name: string; contact?: { email?: string }; emails?: { notifications?: string } };

/** Briefing §4.2: notifications go to the notifications address if the supplier set one. */
const notifyAddress = (s: SupplierContact) => s.emails?.notifications || s.contact?.email || "";

/** §6 "Tender notification": invite the chosen suppliers (inbox + email). */
export async function notifyInvitations(tender: ITender, hotel: Pick<IHotel, "name" | "city" | "emails">, suppliers: SupplierContact[]) {
  const link = `/supplier/tenders/${tender._id}`;
  await Promise.all(
    suppliers.map((supplier) =>
      notifySupplier(
        String(supplier._id),
        { type: "tender", title: `New ${tender.type.toLowerCase()}: ${tender.title}`, body: `${hotel.name} (${hotel.city}) invites you to send a quote.`, link },
        {
          to: notifyAddress(supplier),
          // Briefing §6 "Behoeften": a reply goes straight to the hotel.
          replyTo: hotel.emails?.general,
          subject: `New ${tender.type.toLowerCase()}: ${tender.title}`,
          html: `<p>Dear ${escapeHtml(supplier.name)},</p>
            <p>${escapeHtml(hotel.name)} (${escapeHtml(hotel.city)}) invites you to send a quote.</p>
            <p><strong>${escapeHtml(tender.title)}</strong><br>${escapeHtml(tender.category)} · ${escapeHtml(tender.region)}<br>
            Deadline: ${formatDate(tender.deadline)}</p>
            ${button(`${env.dashboardUrl}${link}`, "View the request and send your quote")}`,
        }
      )
    )
  );
}

/** Tells the hotel a quote came in (melding type "tender"). */
export async function notifyNewOffer(tender: ITender, hotel: Pick<IHotel, "_id" | "name" | "emails">, supplierName: string) {
  const link = `/hotel/tenders/${tender._id}`;
  await notifyHotel(
    String(hotel._id),
    { type: "tender", title: `New quote for "${tender.title}"`, body: `${supplierName} sent a quote.`, link },
    {
      to: hotel.emails.general,
      subject: `New quote for "${tender.title}"`,
      html: `<p>Dear ${escapeHtml(hotel.name)},</p>
        <p>${escapeHtml(supplierName)} sent a quote for <strong>${escapeHtml(tender.title)}</strong>.</p>
        ${button(`${env.dashboardUrl}${link}`, "Compare the quotes")}`,
    }
  );
}

/** Tells each supplier with a quote whether they won (inbox + email). */
export async function notifyResult(tender: ITender, hotel: Pick<IHotel, "name">, supplier: SupplierContact, won: boolean) {
  const link = `/supplier/tenders/${tender._id}`;
  const title = won ? `Your quote for "${tender.title}" was chosen` : `Result for "${tender.title}"`;
  await notifySupplier(
    String(supplier._id),
    { type: "tender", title, body: won ? `${hotel.name} chose your quote.` : `${hotel.name} chose another quote.`, link },
    {
      to: notifyAddress(supplier),
      subject: title,
      html: won
        ? `<p>Dear ${escapeHtml(supplier.name)},</p><p>Good news: ${escapeHtml(hotel.name)} chose your quote for <strong>${escapeHtml(tender.title)}</strong>. The hotel will contact you about the next steps.</p>${button(`${env.dashboardUrl}${link}`, "View the request")}`
        : `<p>Dear ${escapeHtml(supplier.name)},</p><p>${escapeHtml(hotel.name)} chose another quote for <strong>${escapeHtml(tender.title)}</strong>. Thank you for your quote.</p>`,
    }
  );
}
