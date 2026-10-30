import mongoose, { Schema, Document } from "mongoose";

/** One device (browser or installed PWA) that wants push notifications for a user. */
export interface IPushSubscription extends Document {
  user: mongoose.Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  createdAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PushSubscription = mongoose.model<IPushSubscription>("PushSubscription", pushSubscriptionSchema);
