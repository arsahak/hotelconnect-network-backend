// Prices and billing rules in one place. Amounts are in euro cents,
// excluding VAT. Source: Master Briefing v4 and the agreements (13 Nov 2026).

export const VAT_RATE = 21; // percent, Dutch standard rate

/** Payment term of membership and advertising invoices. */
export const PAYMENT_TERM_DAYS = 14;

// ── Memberships (Master Briefing v4, agreements of 13 Nov 2026) ──
// Billed once a year in advance through Moneybird, 14-day payment term.
export type SubscriptionPlan = "hotel" | "supplier-contract" | "supplier-project";
export type BillingInterval = "month" | "quarter" | "year";
export const BILLING_INTERVALS: BillingInterval[] = ["month", "quarter", "year"];
/** Everyone pays per year now. */
export const DEFAULT_INTERVAL: BillingInterval = "year";
export type PriceTier = "standard" | "founding";

/** Hotels pay by number of rooms (0% commission). The price of a membership is not raised. */
export const HOTEL_TIERS = [
  { key: "small", maxRooms: 15, price: 35_000 },
  { key: "medium", maxRooms: 40, price: 49_000 },
  { key: "large", maxRooms: Infinity, price: 75_000 },
] as const;
export type HotelTier = (typeof HOTEL_TIERS)[number]["key"];
/** Without a room count yet the middle tier is used. */
export const hotelTier = (rooms?: number | null) =>
  rooms == null || rooms <= 0 ? HOTEL_TIERS[1] : HOTEL_TIERS.find((t) => rooms <= t.maxRooms) ?? HOTEL_TIERS[2];

/** The first 10 Founding Hotels: the first 12 months after activation are free. */
export const FOUNDING_FREE_MONTHS = 12;

/**
 * Suppliers: free until 1 May 2028. From then, yearly in advance (11 months
 * paid): Project & Capex Partner €19/month = €209/year, Maintenance Partner
 * €59/month = €649/year.
 */
export const SUPPLIER_FREE_UNTIL = new Date("2028-05-01T00:00:00Z");
export const SUPPLIER_PRICES: Record<"supplier-contract" | "supplier-project", { month: number; year: number }> = {
  "supplier-contract": { month: 5_900, year: 64_900 },
  "supplier-project": { month: 1_900, year: 20_900 },
};
/** A supplier's plan in the database → its membership plan. "contract" = Maintenance Partner. */
export const supplierPlan = (plan?: string): "supplier-contract" | "supplier-project" => (plan === "contract" ? "supplier-contract" : "supplier-project");

/** Cancel at least this many months before the end of the contract year (no refunds). */
export const NOTICE_MONTHS = 3;

/** Automatic SEPA direct debit (Moneybird) is the default; members may choose to pay each invoice by hand. */
export type PaymentMethod = "sepa" | "invoice";
export const PAYMENT_METHODS: PaymentMethod[] = ["sepa", "invoice"];

// ── Commission ──
/** Master Briefing v4: 0% commission everywhere. The code stays, switched off. */
export const COMMISSION_ENABLED = false;
export const COMMISSION_PERCENT = Number(process.env.COMMISSION_PERCENT ?? 5);
export const COMMISSION_MAX = 500_000;
export const COMMISSION_PAYMENT_TERM_DAYS = 30;
export const COMMISSION_DUNNING_DAYS = { reminder: 30, secondReminder: 44, block: 51 } as const;

// ── Homepage advertising (briefing §2.1, §3.15) ──
export const AD_BLOCKS = ["suppliers", "jobs", "hotels"] as const;
export type AdBlock = (typeof AD_BLOCKS)[number];
export const AD_POSITIONS = 3;
/** 14 days, or a month = two 14-day periods at a small discount. */
export const AD_PERIODS = ["fortnight", "month"] as const;
export type AdPeriod = (typeof AD_PERIODS)[number];
export const AD_PERIOD_DAYS: Record<AdPeriod, number> = { fortnight: 14, month: 28 };
export const AD_PRICES: Record<AdBlock, Record<AdPeriod, number>> = {
  jobs: { fortnight: 2_900, month: 4_900 },
  hotels: { fortnight: 5_900, month: 9_900 },
  suppliers: { fortnight: 8_900, month: 14_900 },
};
/** Who may book which block: suppliers promote their profile; hotels their hotel or a job. */
export const AD_BLOCKS_FOR = { supplier: ["suppliers"], hotel: ["hotels", "jobs"] } as const;

export const euros = (cents: number) => (cents / 100).toFixed(2);
