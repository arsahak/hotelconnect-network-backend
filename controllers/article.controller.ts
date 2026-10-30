import type { Request, Response } from "express";
import { Article, ARTICLE_LIST_FIELDS } from "../models/article.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, pagination, queryString, toPage } from "../utils/listQuery";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";
import { readingMinutes, sanitizeRichText } from "../utils/sanitizeHtml";
import { uniqueSlug } from "../utils/slugify";
import { deleteFromSpaces } from "../utils/uploadToSpaces";

const published = () => ({ status: "published", publishedAt: { $lte: new Date() } });

// ── Public: homepage content section and /stories ───────────────────────────

export const listArticles = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 9);
  const kind = queryString(req, "kind");
  const filter: Record<string, unknown> = published();
  if (kind) filter.kind = kind;

  const [items, total] = await Promise.all([
    Article.find(filter).select(ARTICLE_LIST_FIELDS).sort({ publishedAt: -1 }).skip(skip).limit(limit).lean(),
    Article.countDocuments(filter),
  ]);

  return ApiResponse(res, 200, "Articles fetched successfully", toPage(items, total, page, limit));
});

export const getArticle = asyncHandler(async (req: Request, res: Response) => {
  const article = await Article.findOne({ ...published(), slug: req.params.slug })
    .select(`${ARTICLE_LIST_FIELDS} body`)
    .lean();
  if (!article) throw new ApiError(404, "Story not found");
  return ApiResponse(res, 200, "Article fetched successfully", article);
});

// ── Admin: manage stories (admin / superadmin) ──────────────────────────────

/** Cleans the HTML and works out the reading time; sets the publish date. */
function applyArticleBody(article: InstanceType<typeof Article>, body: Record<string, unknown>) {
  article.set(pick(body, ["title", "kind", "excerpt", "status"]));
  if (typeof body.body === "string") {
    article.body = sanitizeRichText(body.body);
    article.readingMinutes = readingMinutes(article.body);
  }
  if (body.publishedAt) article.publishedAt = new Date(String(body.publishedAt));
  if (article.status === "published" && !article.publishedAt) article.publishedAt = new Date();
}

export const adminListArticles = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 20);
  const q = queryString(req, "q");
  const kind = queryString(req, "kind");
  const status = queryString(req, "status");

  const filter: Record<string, unknown> = {};
  if (kind) filter.kind = kind;
  if (status) filter.status = status;
  if (q) filter.title = containsRegex(q);

  const [items, total] = await Promise.all([
    Article.find(filter).select("-body").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Article.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Articles fetched successfully", toPage(items, total, page, limit));
});

export const adminGetArticle = asyncHandler(async (req: Request, res: Response) => {
  const article = await Article.findById(req.params.id).lean();
  if (!article) throw new ApiError(404, "Story not found");
  return ApiResponse(res, 200, "Article fetched successfully", article);
});

export const createArticle = asyncHandler(async (req: Request, res: Response) => {
  const article = new Article({ slug: await uniqueSlug(Article, req.body.title) });
  applyArticleBody(article, req.body);
  await article.save();
  return ApiResponse(res, 201, "Story created successfully", article);
});

export const updateArticle = asyncHandler(async (req: Request, res: Response) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new ApiError(404, "Story not found");
  applyArticleBody(article, req.body);
  await article.save();
  return ApiResponse(res, 200, "Story updated successfully", article);
});

export const deleteArticle = asyncHandler(async (req: Request, res: Response) => {
  const article = await Article.findByIdAndDelete(req.params.id);
  if (!article) throw new ApiError(404, "Story not found");
  await deleteFromSpaces(article.imageKey);
  return ApiResponse(res, 200, "Story deleted successfully");
});

const ARTICLE_IMAGE = { field: "image", keyField: "imageKey", folder: "stories" };

export const uploadArticleImage = asyncHandler(async (req: Request, res: Response) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new ApiError(404, "Story not found");
  await replaceImage(article, req.file, ARTICLE_IMAGE);
  return ApiResponse(res, 200, "Photo updated successfully", article);
});

export const deleteArticleImage = asyncHandler(async (req: Request, res: Response) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw new ApiError(404, "Story not found");
  await removeImage(article, ARTICLE_IMAGE);
  return ApiResponse(res, 200, "Photo removed successfully", article);
});
