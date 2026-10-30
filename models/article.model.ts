import mongoose, { Schema, Document } from "mongoose";
import { ARTICLE_KINDS } from "../config/constants";

/** Homepage content section and /stories: articles, interviews, columns. */
export interface IArticle extends Document {
  title: string;
  slug: string;
  kind: string;
  excerpt: string;
  /** Rich text (HTML) written in the dashboard editor. */
  body: string;
  image: string;
  imageKey?: string;
  readingMinutes: number;
  status: "draft" | "published";
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Article:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         slug: { type: string }
 *         kind: { type: string, enum: [Article, Interview, Column] }
 *         excerpt: { type: string }
 *         body: { type: string, description: HTML (only on the detail route) }
 *         image: { type: string }
 *         readingMinutes: { type: number, example: 4 }
 *         publishedAt: { type: string, format: date-time }
 */
const articleSchema = new Schema<IArticle>(
  {
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, enum: ARTICLE_KINDS, default: "Article" },
    excerpt: { type: String, trim: true, default: "", maxlength: 300 },
    body: { type: String, default: "" },
    image: { type: String, trim: true, default: "" },
    imageKey: { type: String, trim: true, default: "" },
    readingMinutes: { type: Number, default: 3, min: 1 },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

articleSchema.index({ status: 1, publishedAt: -1 });

export const ARTICLE_LIST_FIELDS = "title slug kind excerpt image readingMinutes publishedAt";

export const Article = mongoose.model<IArticle>("Article", articleSchema);
