import type mongoose from "mongoose";
import type { NotificationChannel, NotificationType } from "../config/constants";
import { Hotel } from "../models/hotel.model";
import { Notification } from "../models/notification.model";
import { pushToHotel, pushToSupplier } from "./push";
import { sendEmail, type EmailMessage } from "./sendEmail";

type Id = mongoose.Types.ObjectId | string;

export interface Melding {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/** Emails here are best-effort: a failed email never undoes the action itself. */
async function trySend(email: EmailMessage) {
  if (!email.to) return;
  try {
    await sendEmail(email);
  } catch (error) {
    console.error(`[notify] email to ${email.to} failed:`, error instanceof Error ? error.message : error);
  }
}

/** The hotel's choice for this kind of melding (briefing §3.12 aanvulling); default both. */
export async function hotelChannel(hotelId: Id, type: NotificationType): Promise<NotificationChannel> {
  return (await hotelPreferences(hotelId, type)).channel;
}

async function hotelPreferences(hotelId: Id, type: NotificationType) {
  const hotel = await Hotel.findById(hotelId).select("notificationChannels notificationPush").lean();
  return {
    channel: (hotel?.notificationChannels?.[type] ?? "both") as NotificationChannel,
    push: hotel?.notificationPush?.[type] !== false,
  };
}

/**
 * A melding for a hotel: in the dashboard inbox (plus a push on the phone, if
 * switched on) and/or by email, as the hotel chose for this type. Without
 * `email` only the inbox part happens.
 */
export async function notifyHotel(hotelId: Id, melding: Melding, email?: EmailMessage) {
  const { channel, push } = await hotelPreferences(hotelId, melding.type);
  if (channel !== "email") {
    await Notification.create({ hotel: hotelId, ...melding });
    if (push) await pushToHotel(hotelId, melding);
  }
  if (email && channel !== "dashboard") await trySend(email);
}

/** A melding for a supplier: always in the inbox and by email (briefing §3.12). */
export async function notifySupplier(supplierId: Id, melding: Melding, email?: EmailMessage) {
  await Notification.create({ supplier: supplierId, ...melding });
  await pushToSupplier(supplierId, melding);
  if (email) await trySend(email);
}
