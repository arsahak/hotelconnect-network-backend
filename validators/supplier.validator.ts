import { body, param, query, type ValidationChain } from "express-validator";
import { COUNTRY_CODES, SUPPLIER_BIO_MAX, SUPPLIER_CATEGORIES, SUPPLIER_REGIONS } from "../config/constants";
import { adminListRules, idParamRule, listQueryRules, optionalIn, optionalUrl, slugParamRule } from "./common.validator";
import { PHONE_REGEX } from "../models/user.model";

export const listSuppliersRules: ValidationChain[] = [
  ...listQueryRules,
  optionalIn("category", SUPPLIER_CATEGORIES, "Category"),
  optionalIn("region", SUPPLIER_REGIONS, "Region"),
  query("featured").optional().isBoolean().withMessage("featured must be true or false"),
  query("purchasing").optional().isBoolean().withMessage("purchasing must be true or false"),
];

export const supplierSlugRules: ValidationChain[] = [slugParamRule];

// ── Admin ────────────────────────────────────────────────────────────────────

export const listOf = (field: string, allowed: readonly string[], label: string) =>
  body(field)
    .optional()
    .isArray()
    .withMessage(`${label} must be a list`)
    .custom((values: string[]) => {
      const wrong = values.filter((value) => !allowed.includes(value));
      if (wrong.length) throw new Error(`Unknown ${label.toLowerCase()}: ${wrong.join(", ")}`);
      return true;
    });

/** Body for adding (create = true) or editing a supplier. */
export const supplierBodyRules = (create: boolean): ValidationChain[] => [
  (create ? body("name") : body("name").optional()).trim().isLength({ min: 2, max: 120 }).withMessage("Name must be 2–120 characters"),
  body("tagline").optional().isString().trim().isLength({ max: 200 }).withMessage("The one-line description can be at most 200 characters"),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: SUPPLIER_BIO_MAX })
    .withMessage(`The company bio can be at most ${SUPPLIER_BIO_MAX} characters`),
  body("city").optional().isString().trim().isLength({ max: 80 }).withMessage("City can be at most 80 characters"),
  body("country").optional().isIn(COUNTRY_CODES).withMessage("Choose the country"),
  listOf("categories", SUPPLIER_CATEGORIES, "Categories"),
  listOf("regions", SUPPLIER_REGIONS, "Regions"),
  optionalUrl("website", "Website"),
  body("plan").optional().isIn(["contract", "commission"]).withMessage("Plan must be contract or commission"),
  body("kvkNumber").optional().trim().customSanitizer((v: string) => String(v ?? "").replace(/\s/g, "")).matches(/^$|^[0-9]{8}$/).withMessage("The KVK number has 8 digits"),
  body("featured").optional().isBoolean().toBoolean(),
  body("showInPurchasing").optional().isBoolean().toBoolean(),
  body("isActive").optional().isBoolean().toBoolean(),
  (create ? body("contact.email") : body("contact.email").optional())
    .trim()
    .isEmail()
    .withMessage("Contact email must be a valid email address")
    .customSanitizer((value: string) => value.toLowerCase()),
  body("contact.person").optional().isString().trim().isLength({ max: 100 }),
  body("contact.phone")
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((value: string) => value.replace(/[\s()-]/g, ""))
    .matches(PHONE_REGEX)
    .withMessage("Contact phone must be a valid phone number"),
];

export const supplierIdRules: ValidationChain[] = [idParamRule];
export const adminListSuppliersRules: ValidationChain[] = [
  ...adminListRules,
  optionalIn("category", SUPPLIER_CATEGORIES, "Category"),
];

// ── Admin: the supplier's logins ─────────────────────────────────────────────

export const supplierLoginRules: ValidationChain[] = [
  idParamRule,
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").optional().trim(),
  body("email").trim().isEmail().withMessage("Fill in a valid email address").customSanitizer((v: string) => v.toLowerCase()),
  body("password").isString().isLength({ min: 8, max: 72 }).withMessage("Password must be between 8 and 72 characters"),
];

export const supplierUserRules: ValidationChain[] = [idParamRule, param("userId").isMongoId().withMessage("Invalid login")];
