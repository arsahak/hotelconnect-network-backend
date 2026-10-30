import { env } from "../config/env";
import { euros, VAT_RATE } from "../config/billing";

// Moneybird: all invoices live in one administration (briefing). Subscription
// invoices are sent by Moneybird with its online payment methods (SEPA or a
// payment link); Moneybird matches bank payments itself.
// Docs: https://developer.moneybird.com/api/

export const moneybirdEnabled = () => Boolean(env.moneybird.token && env.moneybird.administrationId);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://moneybird.com/api/v2/${env.moneybird.administrationId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.moneybird.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(`Moneybird ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 200)}`);
  return body as T;
}

export interface MoneybirdContactInput {
  companyName: string;
  email: string;
  address?: string;
  city?: string;
  kvkNumber?: string;
  customerId: string; // our member number
}

/** Finds the contact by member number, or creates it. */
export async function ensureMoneybirdContact(input: MoneybirdContactInput): Promise<string> {
  const found = await call<{ id: string }[]>(`/contacts.json?query=${encodeURIComponent(input.customerId)}`);
  if (found[0]?.id) return found[0].id;
  const created = await call<{ id: string }>("/contacts.json", {
    method: "POST",
    body: JSON.stringify({
      contact: {
        company_name: input.companyName,
        customer_id: input.customerId,
        send_invoices_to_email: input.email,
        address1: input.address ?? "",
        city: input.city ?? "",
        chamber_of_commerce: input.kvkNumber ?? "",
        country: "NL",
      },
    }),
  });
  return created.id;
}

let taxRateId: string | null = null;

/** The administration's sales tax rate matching VAT_RATE (looked up once). */
async function salesTaxRateId(): Promise<string | undefined> {
  if (taxRateId) return taxRateId;
  const rates = await call<{ id: string; percentage: string; tax_rate_type: string; active: boolean }[]>(
    "/tax_rates.json?filter=tax_rate_type:sales_invoice"
  );
  taxRateId = rates.find((r) => r.active && Number(r.percentage) === VAT_RATE)?.id ?? null;
  return taxRateId ?? undefined;
}

/** Creates a sales invoice and sends it by email. Returns its id and URL. */
export async function createAndSendMoneybirdInvoice(input: {
  contactId: string;
  reference: string;
  lines: { description: string; quantity: number; unitPrice: number }[];
}): Promise<{ id: string; url: string }> {
  const tax = await salesTaxRateId();
  const invoice = await call<{ id: string; url: string }>("/sales_invoices.json", {
    method: "POST",
    body: JSON.stringify({
      sales_invoice: {
        contact_id: input.contactId,
        reference: input.reference,
        prices_are_incl_tax: false,
        details_attributes: input.lines.map((l) => ({
          description: l.description,
          amount: String(l.quantity),
          price: euros(l.unitPrice),
          ...(tax ? { tax_rate_id: tax } : {}),
        })),
      },
    }),
  });
  await call(`/sales_invoices/${invoice.id}/send_invoice.json`, {
    method: "PATCH",
    body: JSON.stringify({ sales_invoice_sending: { delivery_method: "Email" } }),
  });
  return { id: invoice.id, url: invoice.url };
}

/** Registers a payment received elsewhere (Mollie or by hand), so Moneybird shows it as paid. */
export async function registerMoneybirdPayment(invoiceId: string, amountCents: number, date = new Date()) {
  await call(`/sales_invoices/${invoiceId}/payments.json`, {
    method: "POST",
    body: JSON.stringify({ payment: { payment_date: date.toISOString().slice(0, 10), price: euros(amountCents) } }),
  });
}

/** Moneybird's state of an invoice: draft, open, scheduled, pending_payment, late, reminded, paid, uncollectible. */
export async function getMoneybirdInvoiceState(invoiceId: string): Promise<string> {
  const invoice = await call<{ state: string }>(`/sales_invoices/${invoiceId}.json`);
  return invoice.state;
}
