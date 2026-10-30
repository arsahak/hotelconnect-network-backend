import mongoose, { Schema, Document } from "mongoose";
import { FAULT_TYPES } from "../config/constants";

/**
 * Storingslijst (briefing §3.4.3): who the hotel calls when something breaks.
 * No log of faults is kept — the list only holds the contacts.
 */
export interface IFaultContact extends Document {
  hotel: mongoose.Types.ObjectId;
  name: string;
  faultType: string;
  phone: string;
  /** WhatsApp in international format without "+", e.g. 31612345678. */
  whatsapp?: string;
  email?: string;
  website?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     FaultContact:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, example: Technisch Beheer West }
 *         faultType: { type: string, example: Lift }
 *         phone: { type: string, example: "+31201234567" }
 *         whatsapp: { type: string, example: "31612345678" }
 *         email: { type: string }
 *         website: { type: string, description: Website or service form }
 *         notes: { type: string, example: Contract number 88412 }
 */
const faultContactSchema = new Schema<IFaultContact>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 120 },
    faultType: { type: String, enum: FAULT_TYPES, required: [true, "Type of fault is required"] },
    phone: { type: String, required: [true, "Phone number is required"], trim: true, maxlength: 30 },
    whatsapp: { type: String, trim: true, default: "", match: [/^$|^[0-9]{8,15}$/, "WhatsApp: digits with country code"] },
    email: { type: String, trim: true, lowercase: true, default: "" },
    website: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

export const FaultContact = mongoose.model<IFaultContact>("FaultContact", faultContactSchema);
