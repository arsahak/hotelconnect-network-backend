import { body, type ValidationChain } from "express-validator";
import { SUPPLIER_CATEGORIES, SUPPLIER_REGIONS } from "../config/constants";
import { PHONE_REGEX } from "../models/user.model";
import { optionalUrl } from "./common.validator";
import { listOf } from "./supplier.validator";

const optionalEmail = (field: string, label: string) =>
  body(field)
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage(`${label} must be a valid email address`)
    .customSanitizer((value: string) => value.toLowerCase());

/**
 * Briefing §4.7: the supplier edits contact, emails, categories, regions,
 * description, website and certificate links. Name and member number stay
 * with HotelConnect.
 */
export const mySupplierRules: ValidationChain[] = [
  body("tagline").optional().isString().trim().isLength({ max: 200 }).withMessage("The one-line description can be at most 200 characters"),
  body("description")
    .optional()
    .isString()
    .trim()
    .custom((text: string) => text.split(/\s+/).filter(Boolean).length <= 200)
    .withMessage("Description can be at most 200 words"),
  listOf("categories", SUPPLIER_CATEGORIES, "Categories"),
  listOf("regions", SUPPLIER_REGIONS, "Regions"),
  optionalUrl("website", "Website"),
  body("contact.email").optional().trim().isEmail().withMessage("General email must be a valid email address").customSanitizer((v: string) => v.toLowerCase()),
  body("contact.person").optional().isString().trim().isLength({ max: 100 }),
  body("contact.phone")
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((value: string) => value.replace(/[\s()-]/g, ""))
    .matches(PHONE_REGEX)
    .withMessage("Phone must be a valid phone number"),
  optionalEmail("emails.invoices", "Invoices email"),
  optionalEmail("emails.notifications", "Notifications email"),
  body("certificates").optional().isArray({ max: 20 }).withMessage("At most 20 certificates"),
  body("certificates.*.name").trim().isLength({ min: 2, max: 120 }).withMessage("Each certificate needs a name"),
  body("certificates.*.url")
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("Each certificate link must start with https://"),
];
