import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Who can sign in to the dashboard:
 * - superadmin / admin: the platform owners (beheerder)
 * - hotel_manager: full access to their hotel's dashboard
 * - hotel_staff: the limited staff login of a hotel (sees the repair list only)
 * - supplier: a supplier's dashboard
 */
export const USER_ROLES = [
  "superadmin",
  "admin",
  "hotel_manager",
  "hotel_staff",
  "supplier",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES: UserRole[] = ["superadmin", "admin"];
export const HOTEL_ROLES: UserRole[] = ["hotel_manager", "hotel_staff"];

/**
 * Hotel staff accounts (Master Briefing v4): GM (= hotel_manager),
 * department manager and staff (both hotel_staff). "shared" is the older
 * single staff login of a hotel.
 */
export const HOTEL_USER_ROLES = ["gm", "dept_manager", "staff", "shared"] as const;
export type HotelUserRole = (typeof HOTEL_USER_ROLES)[number];
/** The four floor departments: Housekeeping, Technical (maintenance), Front Office, F&B. */
export const DEPARTMENTS = ["HSK", "TD", "FO", "FB"] as const;
export type Department = (typeof DEPARTMENTS)[number];
/** Languages of the dashboard / floor app. */
export const USER_LANGUAGES = ["en", "nl", "fr"] as const;

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
  avatar?: string;
  // DigitalOcean Spaces object key backing `avatar`, kept only to delete the
  // old file on replace/removal — not shown in swagger docs.
  avatarKey?: string;
  password: string;
  role: UserRole;
  /** The hotel a hotel_manager or hotel_staff account belongs to. */
  hotel?: mongoose.Types.ObjectId;
  /** The supplier a supplier account belongs to. */
  supplier?: mongoose.Types.ObjectId;
  /** Hotel accounts: GM, department manager or staff (Master Briefing v4). */
  hotelRole?: HotelUserRole | null;
  /** Hotel staff: their department; empty = all departments. */
  department?: Department | "" | null;
  /** Preferred language of the dashboard / floor app. */
  language?: (typeof USER_LANGUAGES)[number] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[0-9]{7,15}$/;

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         firstName:
 *           type: string
 *           example: Maaike
 *         lastName:
 *           type: string
 *           example: de Vries
 *         name:
 *           type: string
 *           example: Maaike de Vries
 *         phone:
 *           type: string
 *           example: "+31612345678"
 *         email:
 *           type: string
 *           example: maaike@hotelconnect.nl
 *         avatar:
 *           type: string
 *           example: https://example.com/avatars/maaike.jpg
 *         role:
 *           type: string
 *           enum: [superadmin, admin, hotel_manager, hotel_staff, supplier]
 *           example: admin
 *         hotel:
 *           type: string
 *           description: The hotel of a hotel_manager / hotel_staff account
 *         supplier:
 *           type: string
 *           description: The supplier of a supplier account
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      match: [PHONE_REGEX, "Please enter a valid phone number"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: [EMAIL_REGEX, "Please enter a valid email address"],
    },
    avatar: {
      type: String,
      trim: true,
      default: "",
    },
    avatarKey: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: [true, "Role is required"],
    },
    hotel: {
      type: Schema.Types.ObjectId,
      ref: "Hotel",
      index: true,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      index: true,
    },
    hotelRole: { type: String, enum: [...HOTEL_USER_ROLES, null], default: null },
    department: { type: String, enum: [...DEPARTMENTS, "", null], default: null },
    language: { type: String, enum: [...USER_LANGUAGES, null], default: null },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  if (BCRYPT_HASH_REGEX.test(this.password)) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.virtual("name").get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(" ");
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    const { password, avatarKey, ...rest } = ret as typeof ret & {
      password?: string;
      avatarKey?: string;
    };
    return rest;
  },
});

export const User = mongoose.model<IUser>("User", userSchema);
