import multer from "multer";
import { ApiError } from "../utils/ApiError";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Single image upload (avatars, content images). Files stay in memory and are
// pushed to DigitalOcean Spaces by the controller.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new ApiError(422, "Only JPEG, PNG, WEBP, or GIF images are allowed")
      );
    }
    cb(null, true);
  },
});

const CV_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// CV for a job application (PDF or Word, max 5MB). Kept in memory only for the
// request, then emailed to the hotel — never written to disk or storage.
export const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!CV_MIME_TYPES.includes(file.mimetype)) {
      return cb(new ApiError(422, "Your CV must be a PDF or Word file"));
    }
    cb(null, true);
  },
});

const OFFER_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// A supplier's quote: one PDF or photo, max 5MB (Master Briefing v4). Stored in Spaces.
export const offerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!OFFER_MIME_TYPES.includes(file.mimetype)) {
      return cb(new ApiError(422, "The quote must be a PDF or a photo (JPEG, PNG, WEBP)"));
    }
    cb(null, true);
  },
});

// The latest annual energy invoice for collective purchasing: one PDF, max
// 10MB (briefing §3.13). Stored privately, only admins can read it.
export const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new ApiError(422, "The invoice must be a PDF"));
    cb(null, true);
  },
});

// Floor app issue photo (Master Briefing v4): max 150KB — the app shrinks it first.
export const issuePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new ApiError(422, "The photo must be a JPEG, PNG or WEBP image"));
    }
    cb(null, true);
  },
});
