/**
 * Compliance profile (briefing §3.2, step 2): from the hotel type, which
 * permits and certificates it most likely needs. The dashboard shows them as
 * suggestions; keys are translated there (messages → Compliance.permits).
 */
export interface Facilities {
  rooms?: number | null;
  restaurant?: boolean;
  lift?: boolean;
  pool?: boolean;
  parking?: boolean;
}

const ALWAYS = [
  "operatingPermit",
  "fireSafetyNotice",
  "fireExtinguishers",
  "fireAlarm",
  "emergencyResponse",
  "electricalInspection",
  "riskAssessment",
  "tourismTax",
];

export function complianceSuggestions(facilities: Facilities | undefined) {
  const f = facilities ?? {};
  const permits = [...ALWAYS];
  if (f.restaurant) permits.push("liquorLicence", "terracePermit", "nvwaRegistration", "haccp");
  if (f.lift) permits.push("liftInspection");
  if (f.pool) permits.push("poolHygiene", "legionella");
  if (f.parking) permits.push("parkingVentilation");
  if (!f.pool && (f.rooms ?? 0) >= 10) permits.push("legionella");
  return { permits: [...new Set(permits)] };
}
