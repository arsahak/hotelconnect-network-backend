import { body, query, type ValidationChain } from "express-validator";
import { VOUCHER_CATEGORIES } from "../config/constants";
import { adminListRules, idParamRule, optionalIn } from "./common.validator";

export const memberAccessRules: ValidationChain[] = [
  body("memberNumber")
    .isString()
    .trim()
    .toUpperCase()
    .matches(/^L\d{3,}$/)
    .withMessage("Enter your supplier member number, e.g. L001"),
];

// ── Admin ────────────────────────────────────────────────────────────────────

/** Body for adding (create = true) or editing a voucher. */
export const voucherBodyRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("hotel").isMongoId().withMessage("Choose a hotel"),
    required("title").trim().isLength({ min: 2, max: 120 }).withMessage("Title must be 2–120 characters"),
    body("teaser").optional().isString().trim().isLength({ max: 200 }).withMessage("Teaser can be at most 200 characters"),
    body("description").optional().isString().trim().isLength({ max: 2000 }).withMessage("Description can be at most 2000 characters"),
    required("discountPercent").isInt({ min: 1, max: 100 }).withMessage("Discount must be a whole percentage from 1 to 100").toInt(),
    required("category").isIn(VOUCHER_CATEGORIES).withMessage("Choose a category"),
    required("bookingUrl")
      .trim()
      .isURL({ protocols: ["http", "https"], require_protocol: true })
      .withMessage("Booking link must be a full link starting with https://"),
    body("isActive").optional().isBoolean().toBoolean(),
    body("promotedUntil")
      .optional({ values: "null" })
      .custom((value) => value === "" || !Number.isNaN(Date.parse(value)))
      .withMessage("Promoted until must be a date"),
  ];
};

export const voucherIdRules: ValidationChain[] = [idParamRule];
export const adminListVouchersRules: ValidationChain[] = [
  ...adminListRules,
  optionalIn("category", VOUCHER_CATEGORIES, "Category"),
  query("hotel").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid hotel"),
];

/** Briefing §3.10: the hotel adds its own vouchers; hotel and region come from the hotel. */
export const myVoucherRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("title").trim().isLength({ min: 2, max: 120 }).withMessage("Title must be 2–120 characters"),
    body("teaser").optional().isString().trim().isLength({ max: 200 }).withMessage("Teaser can be at most 200 characters"),
    body("description").optional().isString().trim().isLength({ max: 2000 }).withMessage("Description can be at most 2000 characters"),
    required("discountPercent").isInt({ min: 1, max: 100 }).withMessage("Discount must be a whole percentage from 1 to 100").toInt(),
    required("category").isIn(VOUCHER_CATEGORIES).withMessage("Choose a category"),
    required("bookingUrl")
      .trim()
      .isURL({ protocols: ["http", "https"], require_protocol: true })
      .withMessage("Booking link must be a full link starting with https://"),
    body("isActive").optional().isBoolean().toBoolean(),
  ];
};
