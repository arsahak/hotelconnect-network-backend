import mongoose, { Schema, Document } from "mongoose";

/**
 * Platform settings, one document. testPhase (briefing §1, §9): while on,
 * the site is live but registration is closed and visitors join the waitlist.
 */
export interface ISetting extends Document {
  key: "platform";
  testPhase: boolean;
  updatedAt: Date;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, enum: ["platform"], default: "platform", unique: true },
    testPhase: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const Setting = mongoose.model<ISetting>("Setting", settingSchema);

/** The platform settings (created with the defaults the first time). */
export async function getSettings() {
  return Setting.findOneAndUpdate({ key: "platform" }, { $setOnInsert: { key: "platform" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}
