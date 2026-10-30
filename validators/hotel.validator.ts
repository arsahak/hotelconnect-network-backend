import { body, param, query, type ValidationChain } from "express-validator";
import { REGIONS } from "../config/constants";
import { adminListRules, idParamRule, listQueryRules, optionalIn, optionalUrl, slugParamRule } from "./common.validator";

export const listHotelsRules: ValidationChain[] = [
  ...listQueryRules,
  optionalIn("region", REGIONS, "Region"),
  query("featured").optional().isBoolean().withMessage("featured must be true or false"),
];

export const hotelSlugRules: ValidationChain[] = [slugParamRule];

// ── Admin ────────────────────────────────────────────────────────────────────

const optionalEmail = (field: string, label: string) =>
  body(field)
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage(`${label} must be a valid email address`)
    .customSanitizer((value: string) => value.toLowerCase());

/** Body for adding (create = true) or editing a hotel. */
export const hotelBodyRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("name").trim().isLength({ min: 2, max: 120 }).withMessage("Name must be 2–120 characters"),
    required("city").trim().notEmpty().withMessage("City is required"),
    required("region").isIn(REGIONS).withMessage("Choose a region"),
    required("address").trim().notEmpty().withMessage("Address is required"),
    body("description").optional().isString().trim().isLength({ max: 1000 }).withMessage("Description can be at most 1000 characters"),
    optionalUrl("bookingUrl", "Booking link"),
    body("offer").optional().isString().trim().isLength({ max: 60 }).withMessage("Offer can be at most 60 characters"),
    body("featured").optional().isBoolean().withMessage("featured must be true or false").toBoolean(),
    body("isActive").optional().isBoolean().withMessage("isActive must be true or false").toBoolean(),
    (create ? body("emails.general") : body("emails.general").optional())
      .trim()
      .isEmail()
      .withMessage("General email must be a valid email address")
      .customSanitizer((value: string) => value.toLowerCase()),
    optionalEmail("emails.invoices", "Invoices email"),
    optionalEmail("emails.vacancies", "Vacancies email"),
    optionalEmail("emails.faults", "Faults email"),
    optionalEmail("emails.alerts", "System alerts email"),
  ];
};

export const hotelIdRules: ValidationChain[] = [idParamRule];
export const adminListHotelsRules: ValidationChain[] = [...adminListRules, optionalIn("region", REGIONS, "Region")];

export const hotelManagerRules: ValidationChain[] = [
  idParamRule,
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").optional().trim(),
  body("email").trim().isEmail().withMessage("Fill in a valid email address").customSanitizer((v: string) => v.toLowerCase()),
  body("password").isString().isLength({ min: 8, max: 72 }).withMessage("Password must be between 8 and 72 characters"),
];

export const hotelUserRules: ValidationChain[] = [idParamRule, param("userId").isMongoId().withMessage("Invalid login")];
