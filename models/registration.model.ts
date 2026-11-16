import mongoose, { Schema, Document } from "mongoose";
import { COUNTRY_CODES, DEFAULT_COUNTRY, REGIONS, REGISTRATION_NUMBER_REGEX, SUPPLIER_CATEGORIES, SUPPLIER_REGIONS, VAT_REGEX } from "../config/constants";
import { EMAIL_REGEX } from "./user.model";

/** "waiting": an admin asked the supplier something (e.g. the plan does not match) and waits for the answer. */
export const REGISTRATION_STATUSES = ["pending", "waiting", "approved", "rejected"] as const;
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
  /** Country_Tag (v4), hotels and suppliers. */
  country: string;
  /** When the applicant ticked "I agree to the Terms & Conditions and Privacy Policy". */
  termsAcceptedAt?: Date | null;
  /** Hotels (v4 7-field form) */
  legalName?: string;
  vatNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  rooms?: number;
  billingEmail?: string;
  bookingUrl?: string;
  /** Suppliers */
  categories?: string[];
  regions?: string[];
  plan?: SupplierPlan;
  website?: string;
  /** Token from a hotel's 1-click invite link (Master Briefing v4). */
  invite?: string;
  /** Set on approval / rejection. */
  member?: mongoose.Types.ObjectId | null;
  rejectionReason?: string;
  /** What admins emailed the applicant while checking (client, 31 Oct). */
  messages: { text: string; sentAt: Date }[];
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
 *         country: { type: string, example: NL, description: Country_Tag (ISO code) }
 *         acceptTerms: { type: boolean, description: Must be true }
 *         legalName: { type: string, description: Hotels — legal company name }
 *         vatNumber: { type: string, example: NL123456789B01, description: Hotels }
 *         address: { type: string, description: Hotels }
 *         postalCode: { type: string, description: Hotels }
 *         rooms: { type: integer, description: Hotels — decides the price tier }
 *         billingEmail: { type: string, description: Hotels }
 *         bookingUrl: { type: string, description: Hotels — direct booking engine }
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
    kvkNumber: { type: String, required: true, trim: true, match: [REGISTRATION_NUMBER_REGEX, "Fill in a valid registration number"] },
    contactFirstName: { type: String, required: true, trim: true, maxlength: 60 },
    contactLastName: { type: String, trim: true, default: "", maxlength: 60 },
    email: { type: String, required: true, trim: true, lowercase: true, match: [EMAIL_REGEX, "Please enter a valid email address"] },
    phone: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true, select: false },
    country: { type: String, enum: COUNTRY_CODES, default: DEFAULT_COUNTRY },
    termsAcceptedAt: { type: Date, default: null },
    legalName: { type: String, trim: true, default: "", maxlength: 120 },
    vatNumber: { type: String, trim: true, uppercase: true, default: "", match: [new RegExp(`^$|${VAT_REGEX.source}`), "Fill in a valid VAT number"] },
    address: { type: String, trim: true, default: "" },
    postalCode: { type: String, trim: true, uppercase: true, default: "", maxlength: 12 },
    city: { type: String, trim: true, default: "" },
    rooms: { type: Number, min: 1, max: 5000 },
    billingEmail: { type: String, trim: true, lowercase: true, default: "", match: [new RegExp(`^$|${EMAIL_REGEX.source}`), "Please enter a valid billing email address"] },
    bookingUrl: { type: String, trim: true, default: "" },
    region: { type: String, enum: [...REGIONS, ""], default: "" },
    categories: { type: [{ type: String, enum: SUPPLIER_CATEGORIES }], default: [] },
    regions: { type: [{ type: String, enum: SUPPLIER_REGIONS }], default: [] },
    plan: { type: String, enum: SUPPLIER_PLANS, default: "commission" },
    website: { type: String, trim: true, default: "" },
    invite: { type: String, trim: true, default: "", select: false, maxlength: 64 },
    member: { type: Schema.Types.ObjectId, default: null },
    rejectionReason: { type: String, trim: true, default: "", maxlength: 1000 },
    messages: { type: [new Schema({ text: { type: String, maxlength: 2000 }, sentAt: Date }, { _id: false })], default: [] },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

registrationSchema.index({ email: 1, status: 1 });

export const Registration = mongoose.model<IRegistration>("Registration", registrationSchema);
