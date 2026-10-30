import type { Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { Vacancy } from "../models/vacancy.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";
import { uniqueSlug } from "../utils/slugify";

// The signed-in hotel's own jobs (briefing §3.7). A new or reopened job waits
// for an admin; once published it is on the public jobs page (§6).

const EDITABLE = ["title", "description", "category", "employmentType", "urgent", "style", "videoUrl", "applyWhatsapp"] as const;
const IMAGE = { field: "image", keyField: "imageKey", folder: "vacancies" } as const;
const mine = (req: Request) => ({ hotel: req.user!.hotel });

async function findMine(req: Request) {
  const vacancy = await Vacancy.findOne({ _id: req.params.id, ...mine(req) });
  if (!vacancy) throw new ApiError(404, "Job not found");
  return vacancy;
}

/** All jobs of the hotel, newest first, with the number of CV-form applications. */
export const listMyVacancies = asyncHandler(async (req: Request, res: Response) => {
  const vacancies = await Vacancy.find(mine(req)).sort({ createdAt: -1 }).lean();
  return ApiResponse(res, 200, "Jobs fetched successfully", vacancies);
});

export const getMyVacancy = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Job fetched successfully", await findMine(req));
});

export const createMyVacancy = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.user!.hotel).select("name city region emails").lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");
  const vacancy = await Vacancy.create({
    ...pick(req.body, EDITABLE),
    hotel: hotel._id,
    city: hotel.city,
    region: hotel.region,
    applyEmail: req.body.applyEmail || hotel.emails.vacancies || hotel.emails.general,
    slug: await uniqueSlug(Vacancy, `${req.body.title} ${hotel.name}`),
    status: "pending",
  });
  return ApiResponse(res, 201, "Job saved; HotelConnect will check and publish it", vacancy);
});

/** Edits stay live; closing takes the job off the website, reopening sends it back for approval. */
export const updateMyVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await findMine(req);
  vacancy.set(pick(req.body, EDITABLE));
  if (req.body.applyEmail) vacancy.applyEmail = req.body.applyEmail;
  if (req.body.status === "closed") vacancy.status = "closed";
  if (req.body.status === "pending" && vacancy.status === "closed") vacancy.status = "pending";
  await vacancy.save();
  return ApiResponse(res, 200, "Job saved", vacancy);
});

export const deleteMyVacancy = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await findMine(req);
  await removeImage(vacancy, IMAGE).catch(() => undefined);
  await vacancy.deleteOne();
  return ApiResponse(res, 200, "Job deleted");
});

/** PUT /my-vacancies/:id/image (field "image") — the photo for the visual style. */
export const uploadMyVacancyImage = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await findMine(req);
  await replaceImage(vacancy, req.file, IMAGE);
  return ApiResponse(res, 200, "Photo updated", vacancy);
});

export const deleteMyVacancyImage = asyncHandler(async (req: Request, res: Response) => {
  const vacancy = await findMine(req);
  await removeImage(vacancy, IMAGE);
  return ApiResponse(res, 200, "Photo removed", vacancy);
});
