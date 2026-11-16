import mongoose, { Schema, type Document, type Types } from "mongoose";
import { DEPARTMENTS } from "./user.model";

// The floor app (Master Briefing v4, part 3): rooms & spaces, issues, shift
// handover & schedule, checklists, waste list, procurement. Everything is
// per hotel. Frozen for Phase 2 (not built here): QR codes, PMS links,
// housekeeping rosters, stock counting, vendor carts.

const ref = (model: string, required = false) => ({ type: Schema.Types.ObjectId, ref: model, required, index: true });
const DEPARTMENT = { type: String, enum: [...DEPARTMENTS, ""], default: "" };

// ── Rooms & spaces (also the Inventory List: RAL colours, bulbs, models) ──

export interface ISpace extends Document {
  hotel: Types.ObjectId;
  name: string;
  kind: "room" | "space";
  floor: string;
  /** A sensitive water point for the Legionella log. */
  waterPoint: boolean;
  /** Empty room since (Legionella: vacant > 6 days needs flushing). */
  vacantSince: Date | null;
  /** Blocked for HSK and FO while an issue is open. */
  outOfOrder: boolean;
  /** Inventory List: RAL colours, bulb types, equipment models… */
  specs: string;
}

const spaceSchema = new Schema<ISpace>(
  {
    hotel: ref("Hotel", true),
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: ["room", "space"], default: "room" },
    floor: { type: String, trim: true, default: "", maxlength: 20 },
    waterPoint: { type: Boolean, default: false },
    vacantSince: { type: Date, default: null },
    outOfOrder: { type: Boolean, default: false },
    specs: { type: String, trim: true, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);
spaceSchema.index({ hotel: 1, name: 1 }, { unique: true });
export const Space = mongoose.model<ISpace>("Space", spaceSchema);

// ── Issues & tasks ──

export interface IIssue extends Document {
  hotel: Types.ObjectId;
  space: Types.ObjectId | null;
  location: string;
  department: string;
  title: string;
  photo: string;
  photoKey: string;
  /** Blocks the room for HSK and FO until it is fixed. */
  outOfOrder: boolean;
  status: "open" | "fixed";
  reportedBy: Types.ObjectId | null;
  reporterName: string;
  fixedBy: Types.ObjectId | null;
  fixedAt: Date | null;
  createdAt: Date;
}

const issueSchema = new Schema<IIssue>(
  {
    hotel: ref("Hotel", true),
    space: { type: Schema.Types.ObjectId, ref: "Space", default: null },
    location: { type: String, trim: true, default: "", maxlength: 80 },
    department: DEPARTMENT,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    photo: { type: String, default: "" },
    photoKey: { type: String, default: "", select: false },
    outOfOrder: { type: Boolean, default: false },
    status: { type: String, enum: ["open", "fixed"], default: "open", index: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reporterName: { type: String, default: "" },
    fixedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    fixedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
export const Issue = mongoose.model<IIssue>("Issue", issueSchema);

// ── Shift handover & today's schedule ──

export interface ILogEntry extends Document {
  hotel: Types.ObjectId;
  kind: "handover" | "appointment";
  /** The day it is for (midnight UTC). */
  date: Date;
  /** "12:00" for appointments. */
  time: string;
  text: string;
  department: string;
  createdBy: Types.ObjectId | null;
  authorName: string;
  createdAt: Date;
}

const logSchema = new Schema<ILogEntry>(
  {
    hotel: ref("Hotel", true),
    kind: { type: String, enum: ["handover", "appointment"], required: true },
    date: { type: Date, required: true, index: true },
    time: { type: String, default: "", match: [/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Time as HH:MM"] },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    department: DEPARTMENT,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    authorName: { type: String, default: "" },
  },
  { timestamps: true }
);
export const LogEntry = mongoose.model<ILogEntry>("LogEntry", logSchema);

// ── Checklists: Legionella, HACCP, MOD round, preventive maintenance ──

export const CHECKLISTS = ["legionella", "haccp", "mod", "preventive"] as const;
export type ChecklistKind = (typeof CHECKLISTS)[number];
export const SHIFTS = ["morning", "evening", "night"] as const;

export interface IChecklistItem extends Document {
  hotel: Types.ObjectId;
  list: ChecklistKind;
  section: string;
  label: string;
  /** "temp": one °C value; "check": done / not done. */
  kind: "temp" | "check";
  department: string;
  /** HACCP: the highest (cold) or lowest (hot) allowed °C. */
  maxC: number | null;
  minC: number | null;
  /** Preventive maintenance: every N days; external = an outside inspection. */
  intervalDays: number | null;
  external: boolean;
  nextDue: Date | null;
  lastDone: Date | null;
  order: number;
  active: boolean;
}

const itemSchema = new Schema<IChecklistItem>(
  {
    hotel: ref("Hotel", true),
    list: { type: String, enum: CHECKLISTS, required: true, index: true },
    section: { type: String, trim: true, default: "", maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 160 },
    kind: { type: String, enum: ["temp", "check"], default: "check" },
    department: DEPARTMENT,
    maxC: { type: Number, default: null },
    minC: { type: Number, default: null },
    intervalDays: { type: Number, min: 1, max: 3660, default: null },
    external: { type: Boolean, default: false },
    nextDue: { type: Date, default: null },
    lastDone: { type: Date, default: null },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const ChecklistItem = mongoose.model<IChecklistItem>("ChecklistItem", itemSchema);

export interface IChecklistEntry extends Document {
  hotel: Types.ObjectId;
  list: ChecklistKind;
  /** The checklist item, or for Legionella the water point (a Space). */
  item: Types.ObjectId | null;
  space: Types.ObjectId | null;
  date: Date;
  shift: string;
  /** °C (Legionella: cold). */
  value: number | null;
  /** Legionella: warm °C. */
  value2: number | null;
  done: boolean;
  /** Within the limits (false = red alert). */
  ok: boolean;
  note: string;
  signedBy: Types.ObjectId | null;
  signerName: string;
  createdAt: Date;
}

const entrySchema = new Schema<IChecklistEntry>(
  {
    hotel: ref("Hotel", true),
    list: { type: String, enum: CHECKLISTS, required: true },
    item: { type: Schema.Types.ObjectId, ref: "ChecklistItem", default: null },
    space: { type: Schema.Types.ObjectId, ref: "Space", default: null },
    date: { type: Date, required: true },
    shift: { type: String, enum: [...SHIFTS, ""], default: "" },
    value: { type: Number, default: null },
    value2: { type: Number, default: null },
    done: { type: Boolean, default: true },
    ok: { type: Boolean, default: true },
    note: { type: String, trim: true, default: "", maxlength: 300 },
    signedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    signerName: { type: String, default: "" },
  },
  { timestamps: true }
);
entrySchema.index({ hotel: 1, list: 1, date: 1 });
export const ChecklistEntry = mongoose.model<IChecklistEntry>("ChecklistEntry", entrySchema);

// ── F&B waste list ──

export const WASTE_REASONS = ["leftover_buffet", "expired", "breakage", "prep_error"] as const;

export interface IWaste extends Document {
  hotel: Types.ObjectId;
  date: Date;
  product: string;
  quantity: string;
  reason: (typeof WASTE_REASONS)[number];
  authorName: string;
  createdBy: Types.ObjectId | null;
}

const wasteSchema = new Schema<IWaste>(
  {
    hotel: ref("Hotel", true),
    date: { type: Date, required: true, index: true },
    product: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: String, required: true, trim: true, maxlength: 40 },
    reason: { type: String, enum: WASTE_REASONS, required: true },
    authorName: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
export const Waste = mongoose.model<IWaste>("Waste", wasteSchema);

// ── Visual procurement list (no stock counting) ──

export interface IProduct extends Document {
  hotel: Types.ObjectId;
  name: string;
  photo: string;
  photoKey: string;
  department: string;
  supplierName: string;
  supplierPhone: string;
  supplierEmail: string;
  active: boolean;
}

const productSchema = new Schema<IProduct>(
  {
    hotel: ref("Hotel", true),
    name: { type: String, required: true, trim: true, maxlength: 120 },
    photo: { type: String, default: "" },
    photoKey: { type: String, default: "", select: false },
    department: DEPARTMENT,
    supplierName: { type: String, trim: true, default: "", maxlength: 120 },
    supplierPhone: { type: String, trim: true, default: "", maxlength: 30 },
    supplierEmail: { type: String, trim: true, lowercase: true, default: "", maxlength: 254 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const Product = mongoose.model<IProduct>("Product", productSchema);

export interface IProductRequest extends Document {
  hotel: Types.ObjectId;
  product: Types.ObjectId;
  quantity: number;
  note: string;
  status: "requested" | "ordered" | "received";
  requestedBy: Types.ObjectId | null;
  requesterName: string;
  orderedAt: Date | null;
  createdAt: Date;
}

const requestSchema = new Schema<IProductRequest>(
  {
    hotel: ref("Hotel", true),
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, min: 1, max: 1000, default: 1 },
    note: { type: String, trim: true, default: "", maxlength: 200 },
    status: { type: String, enum: ["requested", "ordered", "received"], default: "requested", index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    requesterName: { type: String, default: "" },
    orderedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
export const ProductRequest = mongoose.model<IProductRequest>("ProductRequest", requestSchema);
