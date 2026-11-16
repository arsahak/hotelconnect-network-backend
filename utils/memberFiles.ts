import type { Types } from "mongoose";
import { ChecklistEntry, ChecklistItem, Issue, LogEntry, Product, ProductRequest, Space, Waste } from "../models/floor.model";
import { Offer } from "../models/offer.model";
import { Partner } from "../models/partner.model";
import { Tender } from "../models/tender.model";
import { User } from "../models/user.model";
import { Vacancy } from "../models/vacancy.model";
import { deleteFromSpaces } from "./uploadToSpaces";

// When a hotel or supplier is deleted, its files must leave the bucket too —
// otherwise they stay there (and cost space) with nothing pointing at them.

type Id = Types.ObjectId | string;
const keysOf = (docs: { [k: string]: unknown }[], field: string) => docs.map((d) => d[field] as string | undefined).filter((k): k is string => Boolean(k));

/** Deletes files from the bucket; one failing file never stops the rest. */
export const deleteFiles = (keys: (string | undefined | null)[]) => Promise.all(keys.filter(Boolean).map((k) => deleteFromSpaces(k!)));

/** A hotel's floor app data, job photos, staff avatars, quote files and partner links (with their files). */
export async function deleteHotelFiles(hotel: Id) {
  const tenders = await Tender.find({ hotel }).distinct("_id");
  const [vacancies, users, issues, products, offers] = await Promise.all([
    Vacancy.find({ hotel }).select("imageKey").lean(),
    User.find({ hotel }).select("avatarKey").lean(),
    Issue.find({ hotel }).select("+photoKey").lean(),
    Product.find({ hotel }).select("+photoKey").lean(),
    Offer.find({ tender: { $in: tenders } }).select("file").lean(),
  ]);
  await deleteFiles([
    ...keysOf(vacancies, "imageKey"),
    ...keysOf(users, "avatarKey"),
    ...keysOf(issues, "photoKey"),
    ...keysOf(products, "photoKey"),
    ...offers.map((o) => o.file?.key),
  ]);
  await Promise.all([
    Space.deleteMany({ hotel }),
    Issue.deleteMany({ hotel }),
    LogEntry.deleteMany({ hotel }),
    ChecklistItem.deleteMany({ hotel }),
    ChecklistEntry.deleteMany({ hotel }),
    Waste.deleteMany({ hotel }),
    Product.deleteMany({ hotel }),
    ProductRequest.deleteMany({ hotel }),
    Partner.deleteMany({ hotel }),
  ]);
}

/** A supplier's quote files and quotes, job photos and jobs, login avatars and partner links. */
export async function deleteSupplierFiles(supplier: Id) {
  const [offers, vacancies, users] = await Promise.all([
    Offer.find({ supplier }).select("file").lean(),
    Vacancy.find({ supplier }).select("imageKey").lean(),
    User.find({ supplier }).select("avatarKey").lean(),
  ]);
  await deleteFiles([...offers.map((o) => o.file?.key), ...keysOf(vacancies, "imageKey"), ...keysOf(users, "avatarKey")]);
  await Promise.all([Offer.deleteMany({ supplier }), Vacancy.deleteMany({ supplier }), Partner.deleteMany({ supplier })]);
}
