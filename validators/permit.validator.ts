import { body, type ValidationChain } from "express-validator";
import { idParamRule, listQueryRules, optionalDate, optionalUrl } from "./common.validator";

/** Briefing §3.4.4: only the type is required. */
export const permitBodyRules = (create: boolean): ValidationChain[] => [
  (create ? body("type") : body("type").optional()).trim().isLength({ min: 2, max: 120 }).withMessage("Fill in the type of permit or certificate"),
  body("authority").optional().isString().trim().isLength({ max: 120 }),
  optionalDate("issueDate", "Issue date"),
  optionalDate("expiryDate", "Expiry date"),
  optionalUrl("documentLink", "Link to document"),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
];

export const permitIdRules: ValidationChain[] = [idParamRule];
export const listPermitsRules: ValidationChain[] = [...listQueryRules];
