import { env } from "../config/env";
import type { TenderType } from "../config/constants";
import type { IHotel } from "../models/hotel.model";
import { Supplier } from "../models/supplier.model";
import type { ITender } from "../models/tender.model";
import { notifyHotel, notifySupplier } from "./notify";
import { escapeHtml } from "./sendEmail";
import { languageFor, tenderAlert } from "./emailTemplates";

/**
 * Master Briefing v4: a tender is open to every supplier in the hotel's
 * country (Country_Tag) with the tender's trade — no limit of 3 any more.
 * "Maintenance" only goes to Maintenance Partners (plan "contract").
 * They all get the new-tender alert and see it under Open Tenders.
 */
export async function matchSuppliers(country: string, category: string, type: TenderType) {
  const filter: Record<string, unknown> = { isActive: true, categories: category, country };
  if (type === "Maintenance") filter.plan = "contract";
  return Supplier.find(filter).select("_id name contact emails").lean();
}

/** Open tenders a supplier may see: its country and trades (Maintenance only for Maintenance Partners). */
export function openTendersFor(supplier: { _id: unknown; country?: string; categories?: string[]; plan?: string }) {
  return {
    status: "open",
    country: supplier.country || "NL",
    category: { $in: supplier.categories ?? [] },
    ...(supplier.plan === "contract" ? {} : { type: { $ne: "Maintenance" } }),
  };
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
        { type: "tender", title: `New ${tender.size === "need" ? "request" : "tender"} (${tender.type.toLowerCase()}): ${tender.title}`, body: `${hotel.name} (${hotel.city}) invites you to send a quote.`, link },
        // Email 6.4 (Master Briefing v4): from noreply@, Reply-To info@, in the hotel country's language.
        (() => {
          const mail = tenderAlert(languageFor({ country: tender.country }), {
            supplierName: supplier.name,
            trade: tender.category,
            city: hotel.city,
            title: tender.title,
            timeline: formatDate(tender.deadline),
            tenderLink: `${env.dashboardUrl}${link}`,
          });
          return { to: notifyAddress(supplier), subject: mail.subject, html: mail.html, from: mail.from };
        })()
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
