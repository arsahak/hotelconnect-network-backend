import mongoose, { Schema, Document } from "mongoose";
import { PORTAL_CATEGORIES, type PortalCategory } from "../config/constants";

/**
 * Handige links & portalen (briefing §3.11): the online portals the hotel
 * manager signs in to. Name, link, username and notes only — never a
 * password. With category "Other" the manager names the category.
 */
export interface IPortalLink extends Document {
  hotel: mongoose.Types.ObjectId;
  category: PortalCategory;
  /** Only for category "Other". */
  customCategory: string;
  name: string;
  url: string;
  username: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     PortalLink:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         category: { type: string, example: Municipality }
 *         customCategory: { type: string, description: Only when category is Other }
 *         name: { type: string, example: Gemeente Amsterdam }
 *         url: { type: string, example: https://mijn.amsterdam.nl }
 *         username: { type: string, example: info@hotel.nl }
 *         notes: { type: string }
 */
const portalLinkSchema = new Schema<IPortalLink>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    category: { type: String, enum: PORTAL_CATEGORIES, required: [true, "Category is required"] },
    customCategory: { type: String, trim: true, default: "", maxlength: 60 },
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 120 },
    url: { type: String, required: [true, "Link is required"], trim: true, maxlength: 500 },
    username: { type: String, trim: true, default: "", maxlength: 120 },
    notes: { type: String, trim: true, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

export const PortalLink = mongoose.model<IPortalLink>("PortalLink", portalLinkSchema);
