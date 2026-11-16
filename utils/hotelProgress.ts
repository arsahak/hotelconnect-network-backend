import type { Types } from "mongoose";
import { Contract } from "../models/contract.model";
import { Space } from "../models/floor.model";
import type { IHotel } from "../models/hotel.model";
import { User } from "../models/user.model";

/**
 * Onboarding progress bar (Master Briefing v4, part 2), 25% per step:
 *  25% company details (the registration form)
 *  50% rooms/spaces + at least 1 staff account
 *  75% at least 1 contract → unlocks Tenders & Jobs
 * 100% main hotel photo + booking URL → listed in the Hotels directory
 */
export type HotelProgress = {
  percent: number;
  steps: { details: boolean; spaces: boolean; contract: boolean; published: boolean };
};

type ProgressHotel = Pick<IHotel, "name" | "address" | "city" | "emails" | "facilities" | "image" | "bookingUrl"> & { _id: Types.ObjectId | unknown };

export async function hotelProgress(hotel: ProgressHotel): Promise<HotelProgress> {
  const [staff, contracts, spaces] = await Promise.all([
    User.countDocuments({ hotel: hotel._id, role: "hotel_staff" }),
    Contract.countDocuments({ hotel: hotel._id }),
    Space.countDocuments({ hotel: hotel._id }),
  ]);
  const steps = {
    details: Boolean(hotel.name && hotel.address && hotel.city && hotel.emails?.general),
    // Rooms & spaces added in the floor app (or at least the number of rooms) + a staff account.
    spaces: (spaces > 0 || Boolean(hotel.facilities?.rooms)) && staff > 0,
    contract: contracts > 0,
    published: Boolean(hotel.image && hotel.bookingUrl),
  };
  return { percent: Object.values(steps).filter(Boolean).length * 25, steps };
}

/** 75%: Tenders and Jobs open once the hotel has added its first contract. */
export async function hasFirstContract(hotelId: Types.ObjectId | string) {
  return Boolean(await Contract.exists({ hotel: hotelId }));
}
