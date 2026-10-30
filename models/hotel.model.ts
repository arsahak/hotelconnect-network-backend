import mongoose, { Schema, Document } from "mongoose";
import { REGIONS, type HotelEmailType, type Region, NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, type NotificationChannel, type NotificationType } from "../config/constants";
import { EMAIL_REGEX } from "./user.model";

/**
 * A member hotel (paid member, H0001…). Its hotel-guide profile is public;
 * the email addresses are private and only used for routing (briefing §3.12).
 */
export interface IHotel extends Document {
  memberNumber: string;
  name: string;
  slug: string;
  city: string;
  region: Region;
  address: string;
  description: string;
  image: string;
  imageKey?: string;
  bookingUrl: string;
  /** Current offer/discount shown on the hotel card, e.g. "15% off midweek". */
  offer?: string;
  /** Shown in homepage block 3. */
  featured: boolean;
  isActive: boolean;
  emails: {
    general: string;
    invoices?: string;
    vacancies?: string;
    faults?: string;
    alerts?: string;
  };
  /** Per email type: does the hotel want to receive it? (briefing §3.12) */
  notify: Record<HotelEmailType, boolean>;
  /** Per kind of melding: email, dashboard or both (briefing §3.12 aanvulling). */
  notificationChannels: Record<NotificationType, NotificationChannel>;
  /** Per kind of melding: also a push on the phone (PWA)? Only with the dashboard channel. */
  notificationPush: Record<NotificationType, boolean>;
  // ── Filled in by the hotel during onboarding (briefing §3.2) ──
  kvkNumber?: string;
  contactPerson?: string;
  phone?: string;
  /** Hotel type → compliance profile. */
  facilities: {
    rooms?: number;
    restaurant: boolean;
    lift: boolean;
    pool: boolean;
    parking: boolean;
  };
  onboarding: {
    /** Last step the hotel reached (1–8). */
    step: number;
    completedAt?: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Hotel:
 *       type: object
 *       description: Public hotel-guide profile (private fields are never returned)
 *       properties:
 *         _id: { type: string }
 *         memberNumber: { type: string, example: H0001 }
 *         name: { type: string, example: Hotel De Gracht }
 *         slug: { type: string, example: hotel-de-gracht }
 *         city: { type: string, example: Amsterdam }
 *         region: { type: string, example: North Holland }
 *         address: { type: string, example: "Herengracht 120, Amsterdam" }
 *         description: { type: string }
 *         image: { type: string }
 *         bookingUrl: { type: string }
 *         offer: { type: string, example: 15% off midweek }
 *         featured: { type: boolean }
 */
const optionalEmail = {
  type: String,
  trim: true,
  lowercase: true,
  match: [EMAIL_REGEX, "Please enter a valid email address"],
};

const hotelSchema = new Schema<IHotel>(
  {
    memberNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true },
    city: { type: String, required: [true, "City is required"], trim: true },
    region: { type: String, enum: REGIONS, required: [true, "Region is required"] },
    address: { type: String, required: [true, "Address is required"], trim: true },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    image: { type: String, trim: true, default: "" },
    imageKey: { type: String, trim: true, default: "" },
    bookingUrl: { type: String, trim: true, default: "" },
    offer: { type: String, trim: true, default: "", maxlength: 60 },
    featured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    emails: {
      general: { ...optionalEmail, required: [true, "General email is required"] },
      invoices: optionalEmail,
      vacancies: optionalEmail,
      faults: optionalEmail,
      alerts: optionalEmail,
    },
    notificationChannels: Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type, { type: String, enum: NOTIFICATION_CHANNELS, default: "both" }])
    ) as Record<NotificationType, object>,
    notificationPush: Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, { type: Boolean, default: true }])) as Record<NotificationType, object>,
    notify: {
      general: { type: Boolean, default: true },
      invoices: { type: Boolean, default: true },
      vacancies: { type: Boolean, default: true },
      faults: { type: Boolean, default: true },
      alerts: { type: Boolean, default: true },
    },
    kvkNumber: { type: String, trim: true, default: "", match: [/^$|^[0-9]{8}$/, "KVK number has 8 digits"] },
    contactPerson: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    facilities: {
      rooms: { type: Number, min: 0, max: 5000 },
      restaurant: { type: Boolean, default: false },
      lift: { type: Boolean, default: false },
      pool: { type: Boolean, default: false },
      parking: { type: Boolean, default: false },
    },
    onboarding: {
      step: { type: Number, default: 1, min: 1, max: 8 },
      completedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

hotelSchema.index({ isActive: 1, region: 1, name: 1 });

/** Fields the public website may see. */
export const HOTEL_PUBLIC_FIELDS =
  "memberNumber name slug city region address description image bookingUrl offer featured";

export const Hotel = mongoose.model<IHotel>("Hotel", hotelSchema);
