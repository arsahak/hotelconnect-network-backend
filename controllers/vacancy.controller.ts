import type { Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { Vacancy, VACANCY_PUBLIC_FIELDS } from "../models/vacancy.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, pagination, queryString, toPage } from "../utils/listQuery";
import { notifyHotel } from "../utils/notify";
import { escapeHtml, sendEmail } from "../utils/sendEmail";
import { pick } from "../utils/pick";
import { uniqueSlug } from "../utils/slugify";

const HOTEL_FIELDS = "name slug city image";

/** Published jobs of active hotels only. */
async function publicFilter(extra: Record<string, unknown> = {}) {
  const activeHotels = await Hotel.find({ isActive: true }).distinct("_id");
  return { status: "published", hotel: { $in: activeHotels }, ...extra };
}

// ── Public: jobs page (briefing §2.2) and homepage block 2 ─────────────────

export const listVacancies = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 12);
  const q = queryString(req, "q");
  const category = queryString(req, "category");
  const region = queryString(req, "region");

  const extra: Record<string, unknown> = {};
  if (category) extra.category = category;
  if (region) extra.region = region;
  if (req.query.urgent === "true") extra.urgent = true;
  if (q) {
    const match = containsRegex(q);
    extra.$or = [{ title: match }, { city: match }, { description: match }];
  }
  const filter = await publicFilter(extra);

  const [items, total] = await Promise.all([
    Vacancy.find(filter)
      .select(VACANCY_PUBLIC_FIELDS)
      .populate("hotel", HOTEL_FIELDS)
      .sort({ urgent: -1, publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Vacancy.countDocuments(filter),
  ]);

  return ApiResponse(res, 200, "Vacancies fetched successfully", toPage(items, total, page, limit));
});

export const getVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await Vacancy.findOne(await publicFilter({ slug: req.params.slug }))
    .select(VACANCY_PUBLIC_FIELDS)
    .populate("hotel", HOTEL_FIELDS)
    .lean();
  if (!vacancy) throw new ApiError(404, "Job not found");
  return ApiResponse(res, 200, "Vacancy fetched successfully", vacancy);
});

/**
 * The CV form: emails the application (with the CV attached) straight to the
 * hotel. The CV only lives in memory for this request — nothing is stored
 * (briefing §2.2 and §7, AVG).
 */
export const applyToVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await Vacancy.findOne(await publicFilter({ slug: req.params.slug }))
    .populate<{ hotel: { _id: unknown; name: string } }>("hotel", "name")
    .lean();
  if (!vacancy) throw new ApiError(404, "Job not found");

  const { name, email, phone, message } = req.body as {
    name: string;
    email: string;
    phone?: string;
    message?: string;
  };
  const cv = req.file;

  const rows = [
    ["Name", name],
    ["Email", email],
    ["Phone", phone || "—"],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6f665b">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const html = `
    <p>Dear ${escapeHtml(vacancy.hotel.name)},</p>
    <p>You received a new application for <strong>${escapeHtml(vacancy.title)}</strong> through HotelConnect.</p>
    <table style="border-collapse:collapse">${rows}</table>
    ${message ? `<p style="margin-top:16px;white-space:pre-line">${escapeHtml(message)}</p>` : ""}
    <p style="margin-top:16px">${cv ? "The CV is attached to this email." : "No CV was attached."} Reply to this email to contact the applicant directly.</p>
    <p style="color:#6f665b;font-size:12px">HotelConnect does not store applications or CVs.</p>
  `;

  await sendEmail({
    to: vacancy.applyEmail,
    subject: `Application: ${vacancy.title} – ${name}`,
    html,
    replyTo: email,
    attachments: cv ? [{ filename: cv.originalname, content: cv.buffer }] : undefined,
  });

  await Vacancy.updateOne({ _id: vacancy._id }, { $inc: { applicationCount: 1 }, lastApplicationAt: new Date() });

  // The email always goes (CVs are never stored, they only travel by email);
  // the dashboard melding follows the hotel's choice for "vacancy".
  await notifyHotel(String(vacancy.hotel._id), {
    type: "vacancy",
    title: `New application: ${vacancy.title}`,
    body: `${name} applied. The application was sent to ${vacancy.applyEmail}.`,
    link: "/dashboard",
  });

  return ApiResponse(res, 200, "Your application was sent to the hotel");
});

// ── Admin: manage jobs (admin / superadmin) ─────────────────────────────────
// Briefing §6: a job appears on the website once an admin publishes it.

const VACANCY_EDITABLE = ["title", "description", "category", "employmentType", "urgent", "status", "applyWhatsapp", "style", "videoUrl"] as const;

async function findHotel(id: string) {
  const hotel = await Hotel.findById(id).select("name city region emails").lean();
  if (!hotel) throw new ApiError(422, "This hotel does not exist");
  return hotel;
}

export const adminListVacancies = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 20);
  const q = queryString(req, "q");
  const status = queryString(req, "status");
  const hotel = queryString(req, "hotel");

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (hotel) filter.hotel = hotel;
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ title: match }, { city: match }];
  }

  const [items, total] = await Promise.all([
    Vacancy.find(filter)
      .populate("hotel", "name city memberNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Vacancy.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Vacancies fetched successfully", toPage(items, total, page, limit));
});

export const adminGetVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await Vacancy.findById(req.params.id).populate("hotel", "name city memberNumber slug").lean();
  if (!vacancy) throw new ApiError(404, "Job not found");
  return ApiResponse(res, 200, "Vacancy fetched successfully", vacancy);
});

export const createVacancy = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await findHotel(req.body.hotel);
  const status = req.body.status ?? "pending";

  const vacancy = await Vacancy.create({
    ...pick(req.body, VACANCY_EDITABLE),
    hotel: hotel._id,
    city: hotel.city,
    region: hotel.region,
    // Applications go to the hotel's "vacancies" address unless another is given.
    applyEmail: req.body.applyEmail || hotel.emails.vacancies || hotel.emails.general,
    slug: await uniqueSlug(Vacancy, `${req.body.title} ${hotel.name}`),
    publishedAt: status === "published" ? new Date() : undefined,
  });
  return ApiResponse(res, 201, "Job created successfully", vacancy);
});

export const updateVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await Vacancy.findById(req.params.id);
  if (!vacancy) throw new ApiError(404, "Job not found");

  if (req.body.hotel && String(req.body.hotel) !== String(vacancy.hotel)) {
    const hotel = await findHotel(req.body.hotel);
    vacancy.set({ hotel: hotel._id, city: hotel.city, region: hotel.region });
  }
  const wasPublished = vacancy.status === "published";
  vacancy.set(pick(req.body, VACANCY_EDITABLE));
  if (req.body.applyEmail) vacancy.applyEmail = req.body.applyEmail;
  // First time it goes live: that's its publish date.
  if (vacancy.status === "published" && !vacancy.publishedAt) vacancy.publishedAt = new Date();

  await vacancy.save();
  // Briefing §6: the hotel hears its job is live once an admin approves it.
  if (!wasPublished && vacancy.status === "published") {
    await notifyHotel(String(vacancy.hotel), {
      type: "vacancy",
      title: `Your job "${vacancy.title}" is live`,
      body: "HotelConnect approved it; it is now on the public jobs page.",
      link: `/hotel/jobs/${vacancy._id}`,
    });
  }
  return ApiResponse(res, 200, "Job updated successfully", vacancy);
});

export const deleteVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await Vacancy.findByIdAndDelete(req.params.id);
  if (!vacancy) throw new ApiError(404, "Job not found");
  return ApiResponse(res, 200, "Job deleted successfully");
});
