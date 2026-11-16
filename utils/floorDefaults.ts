import type { Types } from "mongoose";
import { ChecklistItem, type ChecklistKind } from "../models/floor.model";

const DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC of a day (dates of checklists and the schedule are days). */
export const dayOf = (date: Date | string = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

/** Legionella limits (Master Briefing v4): red when cold > 25 °C or warm < 55 °C. */
export const LEGIONELLA = { coldMax: 25, warmMin: 55, flushEveryDays: 7, vacantDays: 6 } as const;

type Default = { section?: string; label: string; kind?: "temp" | "check"; department?: string; maxC?: number; minC?: number; intervalDays?: number; external?: boolean };

/** Starting lists; the hotel can change or add items (Master Briefing v4). */
const DEFAULTS: Record<Exclude<ChecklistKind, "legionella">, Default[]> = {
  // 4 default HACCP sections (°C or checkbox).
  haccp: [
    { section: "Receiving goods", label: "Chilled delivery core temperature", kind: "temp", maxC: 7, department: "FB" },
    { section: "Receiving goods", label: "Packaging intact, dates checked", department: "FB" },
    { section: "Cold storage", label: "Fridge temperature", kind: "temp", maxC: 7, department: "FB" },
    { section: "Cold storage", label: "Freezer temperature", kind: "temp", maxC: -18, department: "FB" },
    { section: "Cooking & hot holding", label: "Core temperature when cooked", kind: "temp", minC: 75, department: "FB" },
    { section: "Cooking & hot holding", label: "Hot holding (buffet)", kind: "temp", minC: 60, department: "FB" },
    { section: "Cleaning & hygiene", label: "Kitchen cleaned as per schedule", department: "FB" },
    { section: "Cleaning & hygiene", label: "Hand-wash stations stocked", department: "FB" },
  ],
  // MOD round: all departments.
  mod: [
    { section: "Front of house", label: "Lobby and entrance clean and lit" },
    { section: "Front of house", label: "Breakfast room / bar ready" },
    { section: "Safety", label: "Fire exits and escape routes clear" },
    { section: "Safety", label: "Emergency lighting working" },
    { section: "Back of house", label: "Kitchen equipment off / safe" },
    { section: "Back of house", label: "Doors and storerooms locked" },
  ],
  // Internal recurring tasks + annual external inspections.
  preventive: [
    { label: "Elevator inspection", external: true, intervalDays: 365, department: "TD" },
    { label: "Fire alarm / BMC inspection", external: true, intervalDays: 365, department: "TD" },
    { label: "Fire extinguishers check", external: true, intervalDays: 365, department: "TD" },
    { label: "Test emergency lighting", intervalDays: 30, department: "TD" },
    { label: "Descale coffee machines", intervalDays: 30, department: "FB" },
  ],
};

/** Creates a hotel's starting list the first time it is opened. */
export async function ensureDefaults(hotel: Types.ObjectId | string, list: ChecklistKind) {
  if (list === "legionella") return;
  if (await ChecklistItem.exists({ hotel, list })) return;
  const today = dayOf();
  await ChecklistItem.insertMany(
    DEFAULTS[list].map((d, order) => ({
      hotel,
      list,
      order,
      section: d.section ?? "",
      label: d.label,
      kind: d.kind ?? "check",
      department: d.department ?? "",
      maxC: d.maxC ?? null,
      minC: d.minC ?? null,
      intervalDays: d.intervalDays ?? null,
      external: d.external ?? false,
      nextDue: d.intervalDays ? today : null,
    }))
  );
}
