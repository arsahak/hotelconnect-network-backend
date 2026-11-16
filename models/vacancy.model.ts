import mongoose, { Schema, Document } from "mongoose";
import { EMPLOYMENT_TYPES, REGIONS, SUPPLIER_VACANCY_CATEGORIES, supplierVacancyGroup, VACANCY_CATEGORIES } from "../config/constants";
import { EMAIL_REGEX } from "./user.model";

export const VACANCY_STATUSES = ["pending", "published", "closed"] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

/** Briefing §3.7: visual (photo/video, WhatsApp first) or traditional (text and form). */
export const VACANCY_STYLES = ["traditional", "visual"] as const;
export type VacancyStyle = (typeof VACANCY_STYLES)[number];

/**
 * A job at a member hotel. It is public once an admin publishes it
 * (briefing §6). Applicants reach the hotel by WhatsApp, email, or the CV
 * form — the platform never stores applications or CVs.
 */
/** Who offers the job: a hotel, or a supplier with a maintenance contract (client, 31 Oct). */
export const VACANCY_EMPLOYERS = ["hotel", "supplier"] as const;
export type VacancyEmployer = (typeof VACANCY_EMPLOYERS)[number];

export interface IVacancy extends Document {
  employer: VacancyEmployer;
  hotel?: mongoose.Types.ObjectId | null;
  supplier?: mongoose.Types.ObjectId | null;
  title: string;
  slug: string;
  description: string;
  category: string;
  /** Supplier jobs: the main group of the category (for the filter). */
  categoryGroup?: string;
  employmentType: string;
  /** Hours per week, free text (Master Briefing v4 job form), e.g. "32–38 hours". */
  hours: string;
  city: string;
  region: string;
  urgent: boolean;
  status: VacancyStatus;
  /** Where applications go (the hotel's "vacancies" address by default). */
  applyEmail: string;
  /** WhatsApp number in international format without "+", e.g. 31612345678. */
  applyWhatsapp?: string;
  style: VacancyStyle;
  /** Photo for the visual style. */
  image: string;
  imageKey?: string;
  /** YouTube or Vimeo link for the visual style. */
  videoUrl: string;
  /** Applications sent through the CV form — only a count, never who (AVG). */
  applicationCount: number;
  lastApplicationAt?: Date | null;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Vacancy:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string, example: Independent cook }
 *         slug: { type: string, example: independent-cook-hotel-de-gracht }
 *         description: { type: string }
 *         category: { type: string, example: Kitchen }
 *         employmentType: { type: string, example: Full-time }
 *         hours: { type: string, example: 32–38 hours per week }
 *         city: { type: string, example: Amsterdam }
 *         region: { type: string, example: North Holland }
 *         urgent: { type: boolean }
 *         applyEmail: { type: string }
 *         applyWhatsapp: { type: string, example: "31612345678" }
 *         publishedAt: { type: string, format: date-time }
 *         hotel:
 *           type: object
 *           properties:
 *             name: { type: string }
 *             slug: { type: string }
 *             city: { type: string }
 *             image: { type: string }
 */
const vacancySchema = new Schema<IVacancy>(
  {
    employer: { type: String, enum: VACANCY_EMPLOYERS, default: "hotel", index: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", default: null, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: "", maxlength: 10_000 },
    category: { type: String, enum: [...VACANCY_CATEGORIES, ...SUPPLIER_VACANCY_CATEGORIES], required: [true, "Category is required"] },
    categoryGroup: { type: String, default: "" },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: [true, "Type is required"] },
    hours: { type: String, trim: true, default: "", maxlength: 60 },
    city: { type: String, required: true, trim: true },
    // Dutch province; empty for hotels outside the Netherlands (Country_Tag).
    region: { type: String, enum: [...REGIONS, ""], default: "" },
    urgent: { type: Boolean, default: false },
    status: { type: String, enum: VACANCY_STATUSES, default: "pending" },
    applyEmail: {
      type: String,
      required: [true, "Apply email is required"],
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, "Please enter a valid email address"],
    },
    applyWhatsapp: { type: String, trim: true, default: "", match: [/^$|^[0-9]{8,15}$/, "WhatsApp number must be digits only, e.g. 31612345678"] },
    style: { type: String, enum: VACANCY_STYLES, default: "traditional" },
    image: { type: String, trim: true, default: "" },
    imageKey: { type: String, trim: true, default: "" },
    videoUrl: { type: String, trim: true, default: "" },
    applicationCount: { type: Number, default: 0 },
    lastApplicationAt: { type: Date, default: null },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

vacancySchema.index({ status: 1, urgent: -1, publishedAt: -1 });

vacancySchema.pre("validate", function (next) {
  this.employer = this.supplier ? "supplier" : "hotel";
  this.categoryGroup = this.supplier ? supplierVacancyGroup(this.category) ?? "" : "";
  next();
});

export const VACANCY_PUBLIC_FIELDS =
  "title slug description category categoryGroup employmentType hours city region urgent applyEmail applyWhatsapp style image videoUrl publishedAt employer hotel supplier";

export const Vacancy = mongoose.model<IVacancy>("Vacancy", vacancySchema);
