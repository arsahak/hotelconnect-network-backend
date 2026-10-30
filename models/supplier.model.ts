import mongoose, { Schema, Document } from "mongoose";
import { SUPPLIER_CATEGORIES, SUPPLIER_REGIONS } from "../config/constants";
import { EMAIL_REGEX } from "./user.model";

/**
 * A supplier (free in phase 1, L001…). The directory profile is public;
 * contact details are for members only and never returned by public routes.
 */
export interface ISupplier extends Document {
  memberNumber: string;
  name: string;
  slug: string;
  logo: string;
  logoKey?: string;
  /** Large photo for the homepage slideshow. */
  image: string;
  imageKey?: string;
  /** One sentence for the homepage slideshow (briefing §2.1). */
  tagline: string;
  /** Directory text, max. 200 words (briefing §2.4). */
  description: string;
  categories: string[];
  regions: string[];
  website: string;
  /** Shown in the homepage slideshow (block 1). */
  featured: boolean;
  /** Shown as an ad block on the public Purchasing page (briefing §2.6). */
  showInPurchasing: boolean;
  /** Briefing §4.10 / price page: maintenance contract (€49/month or €539/year) or commission only. */
  plan: "contract" | "commission";
  kvkNumber: string;
  /** From the hotels' quality forms (briefing §3.8); see utils/supplierRating.ts. */
  rating: { average: number; count: number; score: number };
  isActive: boolean;
  /** Briefing §4.2: separate addresses for invoices and notifications (general = contact.email). */
  emails: { invoices: string; notifications: string };
  /** Briefing §4.2: certificates as links only (no uploads). */
  certificates: { name: string; url: string }[];
  contact: {
    person?: string;
    email: string;
    phone?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Supplier:
 *       type: object
 *       description: Public directory profile (contact details are never returned)
 *       properties:
 *         _id: { type: string }
 *         memberNumber: { type: string, example: L001 }
 *         name: { type: string, example: Linnen & Co }
 *         slug: { type: string, example: linnen-en-co }
 *         logo: { type: string }
 *         image: { type: string }
 *         tagline: { type: string }
 *         description: { type: string }
 *         categories: { type: array, items: { type: string } }
 *         regions: { type: array, items: { type: string } }
 *         website: { type: string }
 *         featured: { type: boolean }
 */
const supplierSchema = new Schema<ISupplier>(
  {
    memberNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true },
    logo: { type: String, trim: true, default: "" },
    logoKey: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: "" },
    imageKey: { type: String, trim: true, default: "" },
    tagline: { type: String, trim: true, default: "", maxlength: 200 },
    description: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: (text: string) => text.split(/\s+/).filter(Boolean).length <= 200,
        message: "Description can be at most 200 words",
      },
    },
    categories: {
      type: [{ type: String, enum: SUPPLIER_CATEGORIES }],
      default: [],
    },
    regions: {
      type: [{ type: String, enum: SUPPLIER_REGIONS }],
      default: [],
    },
    website: { type: String, trim: true, default: "" },
    featured: { type: Boolean, default: false },
    showInPurchasing: { type: Boolean, default: false },
    plan: { type: String, enum: ["contract", "commission"], default: "commission" },
    kvkNumber: { type: String, trim: true, default: "", match: [/^$|^[0-9]{8}$/, "KVK number has 8 digits"] },
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
      // Used for the ranking. A supplier without reviews sits in the middle.
      score: { type: Number, default: 3.5, index: true },
    },
    isActive: { type: Boolean, default: true },
    emails: {
      invoices: { type: String, trim: true, lowercase: true, default: "", match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"] },
      notifications: { type: String, trim: true, lowercase: true, default: "", match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"] },
    },
    certificates: {
      type: [new Schema({ name: { type: String, trim: true, maxlength: 120, required: true }, url: { type: String, trim: true, required: true } }, { _id: false })],
      default: [],
      validate: { validator: (list: unknown[]) => list.length <= 20, message: "At most 20 certificates" },
    },
    contact: {
      person: { type: String, trim: true, default: "" },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        required: [true, "Contact email is required"],
        match: [EMAIL_REGEX, "Please enter a valid email address"],
      },
      phone: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true }
);

supplierSchema.index({ isActive: 1, name: 1 });

/** Fields the public website may see. */
export const SUPPLIER_PUBLIC_FIELDS =
  "memberNumber name slug logo image tagline description categories regions website featured";

export const Supplier = mongoose.model<ISupplier>("Supplier", supplierSchema);
