// Fixed lists shared by models, validators and the public website filters
// (served at GET /meta/options). Change them here only.

/** The twelve Dutch provinces, used as "region" everywhere. */
export const REGIONS = [
  "North Holland",
  "South Holland",
  "Utrecht",
  "North Brabant",
  "Gelderland",
  "Limburg",
  "Overijssel",
  "Friesland",
  "Groningen",
  "Drenthe",
  "Flevoland",
  "Zeeland",
] as const;
export type Region = (typeof REGIONS)[number];

/**
 * Country_Tag (Master Briefing v4): decides which laws (knowledge base) apply
 * and which suppliers and tenders match. ISO 3166-1 alpha-2 codes.
 */
export const COUNTRIES = [
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "LU", name: "Luxembourg" },
  { code: "GB", name: "United Kingdom" },
] as const;
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const DEFAULT_COUNTRY: CountryCode = "NL";

/** KvK number (NL: 8 digits) or a company registration number elsewhere. */
export const REGISTRATION_NUMBER_REGEX = /^[A-Za-z0-9.\-]{4,20}$/;
/** EU VAT number: country prefix + 2–13 letters/digits, e.g. NL123456789B01. */
export const VAT_REGEX = /^[A-Za-z]{2}[A-Za-z0-9]{2,13}$/;

/** Supplier regions may also be the whole country. */
export const SUPPLIER_REGIONS = ["All of the Netherlands", ...REGIONS] as const;

/** Jobs at hotels (client, 31 Oct 2026). */
export const VACANCY_CATEGORIES = ["F&B", "Housekeeping", "Reception", "Management", "Technical (TD)", "Other hospitality"] as const;
export type VacancyCategory = (typeof VACANCY_CATEGORIES)[number];

/** Jobs at suppliers: five main groups with subcategories (client, 31 Oct 2026). Filters use the group. */
export const SUPPLIER_VACANCY_GROUPS = {
  "Technical & Installation": ["Electrical engineering", "Mechanical engineering", "Climate & cooling", "Lift technology", "Fire safety", "Kitchen equipment"],
  "Construction & Property": ["Contracting & construction", "Painting", "Roofing", "Architecture", "Interior & finishing"],
  "Facilities & Green": ["Cleaning", "Linen & textiles", "Green & garden", "Pest control", "Waste & recycling"],
  "Advisory & Consultancy": ["Sustainability & energy", "Consultancy", "Training & education", "Legal & fiscal"],
  Other: ["IT & telecom", "Marketing & communication", "Other positions"],
} as const;
export type SupplierVacancyGroup = keyof typeof SUPPLIER_VACANCY_GROUPS;
export const SUPPLIER_VACANCY_GROUP_NAMES = Object.keys(SUPPLIER_VACANCY_GROUPS) as SupplierVacancyGroup[];
export const SUPPLIER_VACANCY_CATEGORIES = Object.values(SUPPLIER_VACANCY_GROUPS).flat() as string[];
/** The group of a supplier job's subcategory. */
export const supplierVacancyGroup = (category: string) =>
  SUPPLIER_VACANCY_GROUP_NAMES.find((g) => (SUPPLIER_VACANCY_GROUPS[g] as readonly string[]).includes(category));

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "On call",
  "Internship",
  "Seasonal",
] as const;

export const SUPPLIER_CATEGORIES = [
  "Linen & textiles",
  "Laundry",
  "Cleaning",
  "Technical maintenance",
  "Fire safety",
  "Energy",
  "F&B",
  "Wholesale",
  "Furniture & interior",
  "Amenities",
  "IT & software",
  "Security",
  "Staffing",
  "Sustainability & Certifications",
  "Other",
] as const;

/** Master Briefing v4: the supplier's company bio is at most 500 characters. */
export const SUPPLIER_BIO_MAX = 500;

/** Briefing §2.5: meeting, staying, dining, gift. */
export const VOUCHER_CATEGORIES = ["Meeting", "Stay", "Dining", "Gift"] as const;
export type VoucherCategory = (typeof VOUCHER_CATEGORIES)[number];

export const ARTICLE_KINDS = ["Article", "Interview", "Column"] as const;

/** Storingslijst: what kind of fault a party is called for (briefing §3.4.3). */
export const FAULT_TYPES = [
  "Electricity",
  "Heating & cooling",
  "Water & plumbing",
  "Lift",
  "Fire alarm",
  "Internet & phone",
  "Locks & key cards",
  "Kitchen equipment",
  "Laundry",
  "Pool",
  "Building",
  "Other",
] as const;

/** Notice periods of contracts. */
export const NOTICE_UNITS = ["days", "weeks", "months"] as const;
export type NoticeUnit = (typeof NOTICE_UNITS)[number];

/** Email types a hotel routes to its own addresses (briefing §3.12). */
export const HOTEL_EMAIL_TYPES = ["general", "invoices", "vacancies", "faults", "alerts"] as const;
export type HotelEmailType = (typeof HOTEL_EMAIL_TYPES)[number];

/** Handige links & portalen: the online portals a hotel manager signs in to (briefing §3.11). */
export const PORTAL_CATEGORIES = [
  "KVK",
  "Municipality",
  "Energy supplier",
  "Water supplier",
  "Waste collector",
  "Internet provider",
  "Accounting software",
  "Banking",
  "Tax authority",
  "Omgevingsloket",
  "Pension fund",
  "Occupational health service",
  "Insurance",
  "Software",
  "Other",
] as const;
export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];

/** What a hotel asks suppliers for (client, 31 Oct 2026). "Maintenance" only goes to suppliers with a maintenance contract. */
export const TENDER_TYPES = ["Maintenance", "One-time assignment", "Other"] as const;
export type TenderType = (typeof TENDER_TYPES)[number];

/** Needs (small jobs) and tenders (large assignments) share one form; the budget decides (in euros). */
export const NEED_BUDGET_LIMIT = 5_000;
export type TenderSize = "need" | "tender";
export const tenderSize = (budget: number): TenderSize => (budget < NEED_BUDGET_LIMIT ? "need" : "tender");

/** Kinds of meldingen (briefing §3.12 aanvulling). */
export const NOTIFICATION_TYPES = ["compliance", "tender", "vacancy", "fault", "system", "advertising"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Per type a hotel chooses: email + dashboard (default), only dashboard, or only email. */
export const NOTIFICATION_CHANNELS = ["both", "dashboard", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
