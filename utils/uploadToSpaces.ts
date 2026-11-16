import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

export interface SpacesUpload {
  url: string;
  key: string;
  name: string;
  size: number;
}

let client: S3Client | null = null;

export const isConfigured = () =>
  Boolean(env.spaces.key && env.spaces.secret && env.spaces.endpoint && env.spaces.region && env.spaces.bucket);

/**
 * Local development without Spaces keys: files go to backend/uploads and are
 * served at /uploads (see app.ts). Their key starts with "local:".
 */
export const LOCAL_UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const LOCAL_PREFIX = "local:";
const useLocalDisk = () => !isConfigured() && !env.isProduction;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const assertConfigured = () => {
  if (
    !env.spaces.key ||
    !env.spaces.secret ||
    !env.spaces.endpoint ||
    !env.spaces.region ||
    !env.spaces.bucket
  ) {
    throw new ApiError(
      500,
      "File storage is not configured (STORAGE_* in .env)",
    );
  }
};

export const getClient = (): S3Client => {
  if (client) return client;
  assertConfigured();
  client = new S3Client({
    endpoint: `https://${env.spaces.endpoint}`,
    region: env.spaces.region,
    credentials: {
      accessKeyId: env.spaces.key,
      secretAccessKey: env.spaces.secret,
    },
  });
  return client;
};

export const publicUrlFor = (key: string): string => {
  const cdnHost = env.spaces.cdnEndpoint.replace(/^https?:\/\//, "");
  if (cdnHost && !cdnHost.startsWith("your-")) {
    return `https://${cdnHost}/${key}`;
  }
  return `https://${env.spaces.bucket}.${env.spaces.endpoint}/${key}`;
};

// Every upload lands under the shared bucket's "hotelconnect/<subfolder>/"
// prefix, keeping this project's files namespaced from other apps using
// the same Space, and images/documents both served with public-read ACL.
/** Raster images we re-encode; SVG (vector), PDFs and videos are stored as they are. */
const WEBP_SOURCES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Longest side after conversion: plenty for full-width photos, much smaller files. */
const MAX_IMAGE_SIDE = 2560;

/**
 * Every uploaded photo is stored as WebP (sharp): turned upright from its EXIF
 * data, camera metadata (e.g. GPS) removed, scaled down to at most 2560px,
 * quality 82. Animated GIFs stay animated. Other files pass through unchanged.
 */
export async function toWebp(file: Express.Multer.File): Promise<Express.Multer.File> {
  if (!WEBP_SOURCES.includes(file.mimetype)) return file;
  try {
    const buffer = await sharp(file.buffer, { animated: file.mimetype === "image/gif" || file.mimetype === "image/webp" })
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { ...file, buffer, mimetype: "image/webp", size: buffer.length, originalname: file.originalname.replace(/\.[^.]+$/, "") + ".webp" };
  } catch {
    throw new ApiError(422, "This image could not be read. Please upload a JPEG, PNG, WEBP or GIF photo.");
  }
}

export const uploadToSpaces = async (
  original: Express.Multer.File,
  subfolder = "",
): Promise<SpacesUpload> => {
  const file = await toWebp(original);
  // The extension comes from the checked file type, never from the file name.
  const extension = EXTENSIONS[file.mimetype];

  if (useLocalDisk()) {
    const relative = [subfolder, `${randomUUID()}${extension ? `.${extension}` : ""}`]
      .filter(Boolean)
      .join("/");
    const target = path.join(LOCAL_UPLOAD_DIR, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.buffer);
    return {
      url: `${env.publicUrl}/uploads/${relative}`,
      key: `${LOCAL_PREFIX}${relative}`,
      name: file.originalname,
      size: file.size,
    };
  }

  assertConfigured();

  const key = [env.spaces.rootFolder, subfolder, randomUUID()]
    .filter(Boolean)
    .join("/")
    .concat(extension ? `.${extension}` : "");

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.spaces.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
      // Every file gets a new random name, so browsers and CDNs may keep it for a year.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    url: publicUrlFor(key),
    key,
    name: file.originalname,
    size: file.size,
  };
};

export const deleteFromSpaces = async (key?: string): Promise<void> => {
  if (!key) return;
  if (key.startsWith(LOCAL_PREFIX)) {
    const target = path.join(LOCAL_UPLOAD_DIR, key.slice(LOCAL_PREFIX.length));
    // Never delete outside the uploads folder, whatever the key says.
    if (target.startsWith(LOCAL_UPLOAD_DIR + path.sep)) await unlink(target).catch(() => {});
    return;
  }
  try {
    assertConfigured();
    await getClient().send(
      new DeleteObjectCommand({ Bucket: env.spaces.bucket, Key: key }),
    );
  } catch (err) {
    console.error("Failed to delete from object storage:", key, err);
  }
};

// ── Private files ────────────────────────────────────────────────────────────
// Documents only admins may read, e.g. the hotels' energy invoices (briefing
// §3.13). In Spaces they are stored with a private ACL; without Spaces they
// go to backend/private-uploads, which is never served. Read them through
// the API only.

export const PRIVATE_UPLOAD_DIR = path.join(__dirname, "..", "private-uploads");
const PRIVATE_LOCAL_PREFIX = "private:";

export interface PrivateUpload {
  key: string;
  name: string;
  size: number;
}

export const uploadPrivate = async (original: Express.Multer.File, subfolder: string): Promise<PrivateUpload> => {
  const file = await toWebp(original);
  const extension = EXTENSIONS[file.mimetype];
  const name = `${randomUUID()}${extension ? `.${extension}` : ""}`;

  if (useLocalDisk()) {
    const relative = [subfolder, name].join("/");
    const target = path.join(PRIVATE_UPLOAD_DIR, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.buffer);
    return { key: `${PRIVATE_LOCAL_PREFIX}${relative}`, name: file.originalname, size: file.size };
  }

  assertConfigured();
  const key = [env.spaces.rootFolder, "private", subfolder, name].join("/");
  await getClient().send(
    new PutObjectCommand({ Bucket: env.spaces.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype, ACL: "private" }),
  );
  return { key, name: file.originalname, size: file.size };
};

/** Reads a private file into memory (PDFs here are at most a few MB). */
export const readPrivate = async (key: string): Promise<Buffer> => {
  if (key.startsWith(PRIVATE_LOCAL_PREFIX)) {
    const target = path.join(PRIVATE_UPLOAD_DIR, key.slice(PRIVATE_LOCAL_PREFIX.length));
    if (!target.startsWith(PRIVATE_UPLOAD_DIR + path.sep)) throw new ApiError(400, "Invalid file");
    return readFile(target);
  }
  assertConfigured();
  const res = await getClient().send(new GetObjectCommand({ Bucket: env.spaces.bucket, Key: key }));
  if (!res.Body) throw new ApiError(404, "File not found");
  return Buffer.from(await res.Body.transformToByteArray());
};

export const deletePrivate = async (key?: string): Promise<void> => {
  if (!key) return;
  if (key.startsWith(PRIVATE_LOCAL_PREFIX)) {
    const target = path.join(PRIVATE_UPLOAD_DIR, key.slice(PRIVATE_LOCAL_PREFIX.length));
    if (target.startsWith(PRIVATE_UPLOAD_DIR + path.sep)) await unlink(target).catch(() => {});
    return;
  }
  await deleteFromSpaces(key);
};
