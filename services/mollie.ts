import { env } from "../config/env";
import { euros } from "../config/billing";

// Mollie: one-off payments only (ads, voucher promotions) — briefing: no Mollie Recurring.
// Docs: https://docs.mollie.com/reference/create-payment

const API = "https://api.mollie.com/v2";

export const mollieEnabled = () => Boolean(env.mollie.apiKey);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.mollie.apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(`Mollie ${res.status}: ${body?.detail ?? body?.title ?? "error"}`);
  return body as T;
}

export interface MolliePayment {
  id: string;
  status: "open" | "pending" | "authorized" | "paid" | "canceled" | "expired" | "failed";
  _links: { checkout?: { href: string } };
  metadata?: Record<string, string>;
}

/** Creates a payment; the customer pays on Mollie's checkout page. */
export function createMolliePayment(input: { amountCents: number; description: string; redirectUrl: string; metadata: Record<string, string> }) {
  return call<MolliePayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "EUR", value: euros(input.amountCents) },
      description: input.description.slice(0, 255),
      redirectUrl: input.redirectUrl,
      webhookUrl: `${env.publicUrl}/api/v1/payments/mollie/webhook`,
      metadata: input.metadata,
    }),
  });
}

export function getMolliePayment(id: string) {
  return call<MolliePayment>(`/payments/${encodeURIComponent(id)}`);
}
