import webpush from "web-push";
import type mongoose from "mongoose";
import { env } from "../config/env";
import { PushSubscription } from "../models/pushSubscription.model";
import { User } from "../models/user.model";

type Id = mongoose.Types.ObjectId | string;

export interface PushMessage {
  title: string;
  body?: string;
  /** Dashboard path opened when the notification is tapped. */
  link?: string;
}

const configured = Boolean(env.vapid.publicKey && env.vapid.privateKey);
if (configured) webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);

export const pushEnabled = () => configured;

/** Sends to every device of these users; devices that are gone are forgotten. Never throws. */
export async function pushToUsers(userIds: Id[], message: PushMessage) {
  if (!configured || !userIds.length) return;
  const subscriptions = await PushSubscription.find({ user: { $in: userIds } }).lean();
  const payload = JSON.stringify({ title: message.title, body: message.body ?? "", url: message.link || "/dashboard" });
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 24 * 60 * 60 });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await PushSubscription.deleteOne({ _id: sub._id });
        else console.error("[push] failed:", status ?? (error instanceof Error ? error.message : error));
      }
    })
  );
}

/** The hotel manager(s) of a hotel. Staff use a shared login and get no push. */
export async function pushToHotel(hotelId: Id, message: PushMessage) {
  if (!configured) return;
  const users = await User.find({ hotel: hotelId, role: "hotel_manager", isActive: true }).distinct("_id");
  await pushToUsers(users, message);
}

export async function pushToSupplier(supplierId: Id, message: PushMessage) {
  if (!configured) return;
  const users = await User.find({ supplier: supplierId, role: "supplier", isActive: true }).distinct("_id");
  await pushToUsers(users, message);
}
