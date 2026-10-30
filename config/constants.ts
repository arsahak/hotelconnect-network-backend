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

/** Supplier regions may also be the whole country. */
export const SUPPLIER_REGIONS = ["All of the Netherlands", ...REGIONS] as const;

export const VACANCY_CATEGORIES = [
  "Kitchen",
  "Front Office",
  "Housekeeping",
  "F&B Service",
  "Technical",
  "Management",
  "Other",
] as const;
export type VacancyCategory = (typeof VACANCY_CATEGORIES)[number];

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
  "Other",
] as const;

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

/** What a hotel asks suppliers for (briefing §4.5: tenders, maintenance contracts, product requests). */
export const TENDER_TYPES = ["Tender", "Maintenance contract", "Product request"] as const;
export type TenderType = (typeof TENDER_TYPES)[number];

/** A tender goes to at most this many matching suppliers (briefing §3.5). */
export const TENDER_MAX_SUPPLIERS = 3;

/** Kinds of meldingen (briefing §3.12 aanvulling). */
export const NOTIFICATION_TYPES = ["compliance", "tender", "vacancy", "fault", "system", "advertising"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Per type a hotel chooses: email + dashboard (default), only dashboard, or only email. */
export const NOTIFICATION_CHANNELS = ["both", "dashboard", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
