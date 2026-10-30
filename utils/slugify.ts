import type { Model } from "mongoose";

/** "Hotel De Gracht" → "hotel-de-gracht" (accents removed). */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const RESERVED = new Set(["admin", "featured", "member-access", "options", "apply"]);

/** A slug not used yet in this collection: "name", then "name-2", "name-3", … */
export async function uniqueSlug(
  model: Model<any>,
  text: string,
  excludeId?: unknown
): Promise<string> {
  let base = slugify(text) || "item";
  // Words used by the API's own routes (/hotels/admin, /vouchers/featured, …).
  if (RESERVED.has(base)) base = `${base}-1`;
  let slug = base;
  for (let n = 2; ; n += 1) {
    const clash = await model.exists({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
}
