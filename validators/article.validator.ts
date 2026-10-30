import { body, type ValidationChain } from "express-validator";
import { ARTICLE_KINDS } from "../config/constants";
import { adminListRules, idParamRule, listQueryRules, optionalIn, slugParamRule } from "./common.validator";

export const listArticlesRules: ValidationChain[] = [
  ...listQueryRules,
  optionalIn("kind", ARTICLE_KINDS, "Kind"),
];

export const articleSlugRules: ValidationChain[] = [slugParamRule];

// ── Admin ────────────────────────────────────────────────────────────────────

const STATUSES = ["draft", "published"] as const;

/** Body for adding (create = true) or editing a story. */
export const articleBodyRules = (create: boolean): ValidationChain[] => [
  (create ? body("title") : body("title").optional()).trim().isLength({ min: 2, max: 160 }).withMessage("Title must be 2–160 characters"),
  body("kind").optional().isIn(ARTICLE_KINDS).withMessage(`Kind must be one of: ${ARTICLE_KINDS.join(", ")}`),
  body("excerpt").optional().isString().trim().isLength({ max: 300 }).withMessage("Intro can be at most 300 characters"),
  body("body").optional().isString().isLength({ max: 200_000 }).withMessage("The text is too long"),
  body("status").optional().isIn(STATUSES).withMessage("Status must be draft or published"),
  body("publishedAt")
    .optional({ values: "falsy" })
    .custom((value) => !Number.isNaN(Date.parse(value)))
    .withMessage("Publish date must be a date"),
];

export const articleIdRules: ValidationChain[] = [idParamRule];
export const adminListArticlesRules: ValidationChain[] = [
  ...adminListRules,
  optionalIn("kind", ARTICLE_KINDS, "Kind"),
  optionalIn("status", STATUSES, "Status"),
];
