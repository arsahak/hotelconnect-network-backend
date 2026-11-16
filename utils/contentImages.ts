import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { Article } from "../models/article.model";
import { deleteFromSpaces, getClient, isConfigured, publicUrlFor } from "./uploadToSpaces";

// Images placed inside a story's text with the editor (POST /uploads/content,
// folder "content"). They are not tied to one record, so they are tracked by
// their URL in the story bodies: removed from the text → removed from storage.

const FOLDER = "content";
const ONE_DAY = 24 * 60 * 60 * 1000;

/** The storage keys of editor images in a piece of HTML (our own storage only). */
export function contentImageKeys(html: string | undefined | null): string[] {
  if (!html) return [];
  const remotePrefix = publicUrlFor(`${env.spaces.rootFolder}/${FOLDER}/`);
  const localPrefix = `${env.publicUrl}/uploads/${FOLDER}/`;
  const keys = new Set<string>();
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith(remotePrefix)) keys.add(`${env.spaces.rootFolder}/${FOLDER}/${url.slice(remotePrefix.length)}`);
    else if (url.startsWith(localPrefix)) keys.add(`local:${FOLDER}/${url.slice(localPrefix.length)}`);
  }
  return [...keys];
}

const fileName = (key: string) => key.split("/").pop()!;

/** Deletes editor images unless another story still shows them (a copied image keeps its URL). */
export async function deleteContentImages(keys: string[], exceptArticle?: unknown) {
  for (const key of keys) {
    const name = fileName(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usedElsewhere = await Article.exists({ ...(exceptArticle ? { _id: { $ne: exceptArticle } } : {}), body: { $regex: name } });
    if (!usedElsewhere) await deleteFromSpaces(key);
  }
}

/** After a story's text changed: delete the images that were taken out. */
export async function deleteRemovedContentImages(oldHtml: string | undefined, newHtml: string | undefined, article: unknown) {
  const kept = new Set(contentImageKeys(newHtml));
  await deleteContentImages(contentImageKeys(oldHtml).filter((k) => !kept.has(k)), article);
}

/**
 * Daily clean-up: editor images older than a day that no story uses — e.g.
 * uploaded while writing, but the story was never saved.
 */
export async function sweepUnusedContentImages(): Promise<{ deleted: number }> {
  if (!isConfigured()) return { deleted: 0 };
  const used = new Set<string>();
  for await (const a of Article.find().select("body").lean().cursor()) for (const k of contentImageKeys(a.body)) used.add(fileName(k));

  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await getClient().send(
      new ListObjectsV2Command({ Bucket: env.spaces.bucket, Prefix: `${env.spaces.rootFolder}/${FOLDER}/`, ContinuationToken: token })
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key || used.has(fileName(obj.Key))) continue;
      if (obj.LastModified && Date.now() - obj.LastModified.getTime() < ONE_DAY) continue;
      await deleteFromSpaces(obj.Key);
      deleted++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { deleted };
}
