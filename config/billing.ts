// Prices and billing rules in one place. Amounts are in euro cents,
// excluding VAT. Defaults follow the client's price page (26 Oct 2026);
// what the client has not decided yet is marked "default" — change it here.

export const VAT_RATE = 21; // percent, Dutch standard rate
export const PAYMENT_TERM_DAYS = 14;

/** Briefing price page: hotel €499/year; supplier with maintenance contract €49/month or €539/year. */
export const SUBSCRIPTION_PRICES = {
  hotel: { year: 49_900 },
  "supplier-contract": { month: 4_900, year: 53_900 },
} as const;
export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PRICES;
export type BillingInterval = "month" | "year";

/** Default: suppliers without a contract pay this percentage of the winning quote. */
export const COMMISSION_PERCENT = Number(process.env.COMMISSION_PERCENT ?? 5);

/** Homepage sponsored blocks (briefing §2.1, §3.15). Default: 2 positions per block. */
export const AD_BLOCKS = ["suppliers", "jobs", "hotels"] as const;
export type AdBlock = (typeof AD_BLOCKS)[number];
export const AD_POSITIONS = 2;
export const AD_PERIODS = ["month", "quarter"] as const;
export type AdPeriod = (typeof AD_PERIODS)[number];
/** Default prices per position (the briefing's voucher example: €150/month, €400/quarter). */
export const AD_PRICES: Record<AdPeriod, number> = { month: 15_000, quarter: 40_000 };
/** Who may book which block: suppliers promote their profile; hotels their hotel or a job. */
export const AD_BLOCKS_FOR = { supplier: ["suppliers"], hotel: ["hotels", "jobs"] } as const;

/** Voucher promotion (briefing §3.10 example: €150/month, €400/quarter). */
export const PROMOTION_PRICES: Record<AdPeriod, number> = { month: 15_000, quarter: 40_000 };

export const PERIOD_MONTHS: Record<AdPeriod, number> = { month: 1, quarter: 3 };

export const euros = (cents: number) => (cents / 100).toFixed(2);
