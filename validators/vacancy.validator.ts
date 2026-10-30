import { body, query, type ValidationChain } from "express-validator";
import { EMPLOYMENT_TYPES, REGIONS, VACANCY_CATEGORIES } from "../config/constants";
import { VACANCY_STATUSES, VACANCY_STYLES } from "../models/vacancy.model";
import { PHONE_REGEX } from "../models/user.model";
import { adminListRules, idParamRule, listQueryRules, optionalIn, slugParamRule } from "./common.validator";

export const listVacanciesRules: ValidationChain[] = [
  ...listQueryRules,
  optionalIn("category", VACANCY_CATEGORIES, "Category"),
  optionalIn("region", REGIONS, "Region"),
  query("urgent").optional().isBoolean().withMessage("urgent must be true or false"),
];

export const vacancySlugRules: ValidationChain[] = [slugParamRule];

/** The CV form (multipart). The CV file itself is checked by the upload middleware. */
export const applyRules: ValidationChain[] = [
  slugParamRule,
  body("name").trim().isLength({ min: 2, max: 100 }).withMessage("Please enter your name"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .customSanitizer((value: string) => value.toLowerCase()),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((value: string) => value.replace(/[\s()-]/g, ""))
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("message").optional().isString().trim().isLength({ max: 2000 }).withMessage("Message is too long"),
];

// ── Admin ────────────────────────────────────────────────────────────────────

/** Body for adding (create = true) or editing a job. */
export const vacancyBodyRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("hotel").isMongoId().withMessage("Choose a hotel"),
    required("title").trim().isLength({ min: 2, max: 120 }).withMessage("Title must be 2–120 characters"),
    body("description").optional().isString().trim().isLength({ max: 5000 }).withMessage("Description can be at most 5000 characters"),
    required("category").isIn(VACANCY_CATEGORIES).withMessage("Choose a category"),
    required("employmentType").isIn(EMPLOYMENT_TYPES).withMessage("Choose a type"),
    body("urgent").optional().isBoolean().toBoolean(),
    body("status").optional().isIn(VACANCY_STATUSES).withMessage(`Status must be one of: ${VACANCY_STATUSES.join(", ")}`),
    body("applyEmail")
      .optional({ checkFalsy: true })
      .trim()
      .isEmail()
      .withMessage("Apply email must be a valid email address")
      .customSanitizer((value: string) => value.toLowerCase()),
    body("applyWhatsapp")
      .optional()
      .trim()
      .customSanitizer((value: string) => value.replace(/[^0-9]/g, ""))
      .matches(/^$|^[0-9]{8,15}$/)
      .withMessage("WhatsApp number: digits with country code, e.g. 31612345678"),
  ];
};

export const vacancyIdRules: ValidationChain[] = [idParamRule];
export const adminListVacanciesRules: ValidationChain[] = [
  ...adminListRules,
  optionalIn("status", VACANCY_STATUSES, "Status"),
  query("hotel").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid hotel"),
];

/** YouTube or Vimeo only, so the website can embed it safely. */
const videoRule = body("videoUrl")
  .optional({ checkFalsy: true })
  .trim()
  .isURL({ protocols: ["https"], require_protocol: true, host_whitelist: [/(^|\.)youtube\.com$/, "youtu.be", /(^|\.)vimeo\.com$/] })
  .withMessage("The video must be a YouTube or Vimeo link");

/**
 * Briefing §3.7: the hotel posts its own jobs. The hotel, city and region
 * come from the hotel itself; an admin publishes the job (status).
 */
export const myVacancyRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("title").trim().isLength({ min: 2, max: 120 }).withMessage("Title must be 2–120 characters"),
    body("description").optional().isString().trim().isLength({ max: 5000 }).withMessage("Description can be at most 5000 characters"),
    required("category").isIn(VACANCY_CATEGORIES).withMessage("Choose a category"),
    required("employmentType").isIn(EMPLOYMENT_TYPES).withMessage("Choose a type"),
    body("urgent").optional().isBoolean().toBoolean(),
    body("style").optional().isIn(VACANCY_STYLES).withMessage("Choose visual or traditional"),
    videoRule,
    body("applyEmail")
      .optional({ checkFalsy: true })
      .trim()
      .isEmail()
      .withMessage("Apply email must be a valid email address")
      .customSanitizer((value: string) => value.toLowerCase()),
    body("applyWhatsapp")
      .optional()
      .trim()
      .customSanitizer((value: string) => value.replace(/[^0-9]/g, ""))
      .matches(/^$|^[0-9]{8,15}$/)
      .withMessage("WhatsApp number: digits with country code, e.g. 31612345678"),
    // The hotel can close a job, or reopen it (then an admin checks it again).
    body("status").optional().isIn(["closed", "pending"]).withMessage("A job can be closed or reopened"),
  ];
};
