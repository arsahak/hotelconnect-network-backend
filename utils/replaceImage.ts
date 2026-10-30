import type { Document } from "mongoose";
import { ApiError } from "./ApiError";
import { deleteFromSpaces, uploadToSpaces } from "./uploadToSpaces";

/**
 * Puts a new uploaded image on a document (e.g. hotel.image + hotel.imageKey),
 * saves it, then deletes the old file. If saving fails, the new file is
 * removed again, so storage never fills with orphans.
 */
export async function replaceImage(
  doc: Document & Record<string, any>,
  file: Express.Multer.File | undefined,
  { field, keyField, folder }: { field: string; keyField: string; folder: string }
) {
  if (!file) throw new ApiError(422, "An image file is required");

  const previousKey: string | undefined = doc[keyField];
  const uploaded = await uploadToSpaces(file, folder);
  doc.set(field, uploaded.url);
  doc.set(keyField, uploaded.key);

  try {
    await doc.save();
  } catch (err) {
    await deleteFromSpaces(uploaded.key);
    throw err;
  }
  if (previousKey) await deleteFromSpaces(previousKey);
  return doc;
}

/** Removes an image from a document and deletes the file. */
export async function removeImage(
  doc: Document & Record<string, any>,
  { field, keyField }: { field: string; keyField: string }
) {
  const previousKey: string | undefined = doc[keyField];
  doc.set(field, "");
  doc.set(keyField, "");
  await doc.save();
  if (previousKey) await deleteFromSpaces(previousKey);
  return doc;
}
