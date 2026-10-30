import { body, type ValidationChain } from "express-validator";
import { PORTAL_CATEGORIES } from "../config/constants";
import { idParamRule, listQueryRules } from "./common.validator";

/** Briefing §3.11: name, link, username (optional) and notes. Never a password. */
export const portalLinkBodyRules = (create: boolean): ValidationChain[] => [
  (create ? body("category") : body("category").optional())
    .isIn(PORTAL_CATEGORIES)
    .withMessage("Choose a category from the list"),
  body("customCategory")
    .if(body("category").equals("Other"))
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage("Fill in the category name"),
  (create ? body("name") : body("name").optional()).trim().isLength({ min: 2, max: 120 }).withMessage("Fill in the name"),
  (create ? body("url") : body("url").optional())
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("The link must be a full link starting with https://"),
  body("username").optional().isString().trim().isLength({ max: 120 }),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  body("password").not().exists().withMessage("Passwords may not be stored here"),
];

export const portalLinkIdRules: ValidationChain[] = [idParamRule];
export const listPortalLinksRules: ValidationChain[] = [...listQueryRules];
