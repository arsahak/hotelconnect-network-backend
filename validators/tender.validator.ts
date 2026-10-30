import { body, param, type ValidationChain } from "express-validator";
import { REGIONS, SUPPLIER_CATEGORIES, TENDER_TYPES } from "../config/constants";
import { idParamRule, listQueryRules, optionalNumber } from "./common.validator";

/** The deadline must be a date, today or later. */
const deadlineRule = (create: boolean) =>
  (create ? body("deadline") : body("deadline").optional())
    .custom((value) => {
      const date = Date.parse(value);
      if (Number.isNaN(date)) return false;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return date >= today.getTime();
    })
    .withMessage("The deadline must be today or later");

/** Briefing §3.5: category, region, description, deadline, budget (+ type and title). */
export const tenderCreateRules: ValidationChain[] = [
  body("type").optional().isIn(TENDER_TYPES).withMessage("Choose a type from the list"),
  body("title").trim().isLength({ min: 3, max: 120 }).withMessage("Fill in a short title"),
  body("category").isIn(SUPPLIER_CATEGORIES).withMessage("Choose a category from the list"),
  body("region").isIn(REGIONS).withMessage("Choose a region from the list"),
  body("description").trim().isLength({ min: 10, max: 5000 }).withMessage("Describe what you need (at least 10 characters)"),
  deadlineRule(true),
  optionalNumber("budget", "Budget"),
];

/** After sending, only the text, deadline and budget can change (the suppliers are already chosen). */
export const tenderUpdateRules: ValidationChain[] = [
  idParamRule,
  body("title").optional().trim().isLength({ min: 3, max: 120 }).withMessage("Fill in a short title"),
  body("description").optional().trim().isLength({ min: 10, max: 5000 }).withMessage("Describe what you need (at least 10 characters)"),
  deadlineRule(false),
  optionalNumber("budget", "Budget"),
];

export const tenderIdRules: ValidationChain[] = [idParamRule];
export const listTendersRules: ValidationChain[] = [...listQueryRules];
export const awardRules: ValidationChain[] = [idParamRule, body("offerId").isMongoId().withMessage("Choose a quote")];

/** Briefing §4.6: price, PDF or photo, notes (+ delivery time for the comparison). Sent as multipart. */
export const offerRules: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid id"),
  body("price").customSanitizer(Number).isFloat({ min: 0, max: 1e9 }).withMessage("Fill in a price"),
  body("deliveryTime").optional().isString().trim().isLength({ max: 100 }),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
];

/** Kwaliteitsformulier (briefing §3.8). */
export const reviewRules: ValidationChain[] = [
  idParamRule,
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Give a rating from 1 to 5").toInt(),
  body("communication").isInt({ min: 1, max: 5 }).withMessage("Rate the communication from 1 to 5").toInt(),
  body("onTime").isBoolean().withMessage("Was the job done on time?").toBoolean(),
  body("wouldHireAgain").isBoolean().withMessage("Would you hire this supplier again?").toBoolean(),
  body("comments").optional().isString().trim().isLength({ max: 2000 }),
];
