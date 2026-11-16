import mongoose, { Schema, Document } from "mongoose";

/**
 * Platform settings, one document. testPhase (briefing §1, §9): while on,
 * the site is live but registration is closed and visitors join the waitlist.
 */
/**
 * Phase 2 features (Master Briefing v4): the code stays, but they are hidden
 * until an admin switches them on. Off by default.
 */
export const FEATURE_KEYS = ["vouchers", "advertising", "reviews"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, boolean>;

export interface ISetting extends Document {
  key: "platform";
  testPhase: boolean;
  features: Features;
  updatedAt: Date;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, enum: ["platform"], default: "platform", unique: true },
    testPhase: { type: Boolean, default: true },
    features: {
      vouchers: { type: Boolean, default: false },
      advertising: { type: Boolean, default: false },
      reviews: { type: Boolean, default: false },
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const Setting = mongoose.model<ISetting>("Setting", settingSchema);

/** The platform settings (created with the defaults the first time). */
export async function getSettings() {
  return Setting.findOneAndUpdate({ key: "platform" }, { $setOnInsert: { key: "platform" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

/** Which Phase 2 features are on (all off when the setting is missing). */
export async function getFeatures(): Promise<Features> {
  const s = await getSettings();
  return { vouchers: Boolean(s.features?.vouchers), advertising: Boolean(s.features?.advertising), reviews: Boolean(s.features?.reviews) };
}
