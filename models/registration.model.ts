import mongoose, { Schema, Document } from "mongoose";
import { REGIONS, SUPPLIER_CATEGORIES, SUPPLIER_REGIONS } from "../config/constants";
import { EMAIL_REGEX } from "./user.model";

export const REGISTRATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const SUPPLIER_PLANS = ["contract", "commission"] as const;
export type SupplierPlan = (typeof SUPPLIER_PLANS)[number];

/**
 * A sign-up after the test phase (briefing §3.1, §4.1): a hotel or supplier
 * fills in the form; an admin approves it, which creates the member and its
 * login. The password is stored hashed and becomes the login's password.
 */
export interface IRegistration extends Document {
  type: "hotel" | "supplier";
  status: RegistrationStatus;
  companyName: string;
  kvkNumber: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  passwordHash: string;
  /** Hotels */
  address?: string;
  city?: string;
  region?: string;
  /** Suppliers */
  categories?: string[];
  regions?: string[];
  plan?: SupplierPlan;
  website?: string;
  /** Set on approval / rejection. */
  member?: mongoose.Types.ObjectId | null;
  rejectionReason?: string;
  decidedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Registration:
 *       type: object
 *       properties:
 *         type: { type: string, enum: [hotel, supplier] }
 *         companyName: { type: string }
 *         kvkNumber: { type: string, example: "12345678" }
 *         contactFirstName: { type: string }
 *         contactLastName: { type: string }
 *         email: { type: string }
 *         phone: { type: string }
 *         password: { type: string, minLength: 8, description: Write-only; becomes the login password }
 *         address: { type: string, description: Hotels }
 *         city: { type: string, description: Hotels }
 *         region: { type: string, description: Hotels }
 *         categories: { type: array, items: { type: string }, description: Suppliers }
 *         regions: { type: array, items: { type: string }, description: Suppliers }
 *         plan: { type: string, enum: [contract, commission], description: Suppliers }
 *         website: { type: string, description: Suppliers }
 */
const registrationSchema = new Schema<IRegistration>(
  {
    type: { type: String, enum: ["hotel", "supplier"], required: true },
    status: { type: String, enum: REGISTRATION_STATUSES, default: "pending", index: true },
    companyName: { type: String, required: true, trim: true, maxlength: 120 },
    kvkNumber: { type: String, required: true, trim: true, match: [/^[0-9]{8}$/, "KVK number has 8 digits"] },
    contactFirstName: { type: String, required: true, trim: true, maxlength: 60 },
    contactLastName: { type: String, trim: true, default: "", maxlength: 60 },
    email: { type: String, required: true, trim: true, lowercase: true, match: [EMAIL_REGEX, "Please enter a valid email address"] },
    phone: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true, select: false },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    region: { type: String, enum: [...REGIONS, ""], default: "" },
    categories: { type: [{ type: String, enum: SUPPLIER_CATEGORIES }], default: [] },
    regions: { type: [{ type: String, enum: SUPPLIER_REGIONS }], default: [] },
    plan: { type: String, enum: SUPPLIER_PLANS, default: "commission" },
    website: { type: String, trim: true, default: "" },
    member: { type: Schema.Types.ObjectId, default: null },
    rejectionReason: { type: String, trim: true, default: "", maxlength: 1000 },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

registrationSchema.index({ email: 1, status: 1 });

export const Registration = mongoose.model<IRegistration>("Registration", registrationSchema);
