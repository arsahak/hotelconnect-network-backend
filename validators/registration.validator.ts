import { body, query, type ValidationChain } from "express-validator";
import { COUNTRY_CODES, REGIONS, REGISTRATION_NUMBER_REGEX, SUPPLIER_CATEGORIES, SUPPLIER_REGIONS, VAT_REGEX } from "../config/constants";
import { LEGAL_DOCUMENTS, REGISTRATION_STATUSES, SUPPLIER_PLANS } from "../models/registration.model";
import { PHONE_REGEX } from "../models/user.model";
import { idParamRule, optionalUrl } from "./common.validator";
import { listOf } from "./supplier.validator";

const isHotel = body("type").equals("hotel");
const isSupplier = body("type").equals("supplier");
const isDutch = body("country").equals("NL");
const compact = (v: unknown) => String(v ?? "").replace(/\s/g, "");

/**
 * Briefing §3.1 / §4.1 + Master Briefing v4 (7-field hotel form): name and legal
 * name, KvK / registration number, VAT, address + country (Country_Tag), rooms
 * (decides the tier), general + billing email, booking URL, and the T&C tick.
 */
export const registrationRules: ValidationChain[] = [
  body("type").isIn(["hotel", "supplier"]).withMessage("Choose hotel or supplier"),
  body("country").default("NL").isIn(COUNTRY_CODES).withMessage("Choose the country"),
  body("acceptTerms").custom((v) => v === true || v === "true").withMessage("Please accept the agreement and the terms"),
  body("termsVersion").optional().isString().trim().isLength({ max: 60 }),
  body("termsDocuments").optional().isArray({ max: 5 }),
  body("termsDocuments.*").isIn(LEGAL_DOCUMENTS).withMessage("Unknown document"),
  body("clientIp").optional({ checkFalsy: true }).isIP().withMessage("Unknown IP address"),
  body("companyName").trim().isLength({ min: 2, max: 120 }).withMessage("Fill in your company name"),
  body("kvkNumber")
    .customSanitizer(compact)
    .if(isDutch)
    .matches(/^[0-9]{8}$/)
    .withMessage("The KvK number has 8 digits"),
  body("kvkNumber").matches(REGISTRATION_NUMBER_REGEX).withMessage("Fill in your registration number"),
  body("contactFirstName").trim().isLength({ min: 1, max: 60 }).withMessage("Fill in your first name"),
  body("contactLastName").optional().trim().isLength({ max: 60 }),
  body("email").trim().isEmail().withMessage("Fill in a valid email address").customSanitizer((v: string) => v.toLowerCase()),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((value: string) => value.replace(/[\s()-]/g, ""))
    .matches(PHONE_REGEX)
    .withMessage("Fill in a valid phone number"),
  body("password").isString().isLength({ min: 8, max: 72 }).withMessage("Choose a password of at least 8 characters"),
  body("legalName").optional().trim().isLength({ max: 120 }),
  body("vatNumber").if(isHotel).customSanitizer((v: unknown) => compact(v).replace(/\./g, "").toUpperCase()).matches(VAT_REGEX).withMessage("Fill in a valid VAT number, e.g. NL123456789B01"),
  body("address").if(isHotel).trim().isLength({ min: 3, max: 200 }).withMessage("Fill in the hotel's street and number"),
  body("postalCode").if(isHotel).trim().isLength({ min: 3, max: 12 }).withMessage("Fill in the postal code"),
  body("city").if(isHotel).trim().isLength({ min: 2, max: 80 }).withMessage("Fill in the city"),
  body("region").if(isHotel).if(isDutch).isIn(REGIONS).withMessage("Choose the province"),
  body("rooms").if(isHotel).isInt({ min: 1, max: 5000 }).withMessage("Fill in the number of rooms").toInt(),
  body("billingEmail").if(isHotel).trim().isEmail().withMessage("Fill in a valid billing email address").customSanitizer((v: string) => v.toLowerCase()),
  optionalUrl("bookingUrl", "Booking engine URL"),
  listOf("categories", SUPPLIER_CATEGORIES, "Categories"),
  listOf("regions", SUPPLIER_REGIONS, "Regions"),
  body("categories").if(isSupplier).isArray({ min: 1 }).withMessage("Choose at least one category"),
  body("regions").if(isSupplier).isArray({ min: 1 }).withMessage("Choose at least one region"),
  body("plan").if(isSupplier).isIn(SUPPLIER_PLANS).withMessage("Choose a plan"),
  optionalUrl("website", "Website"),
  body("invite").optional({ checkFalsy: true }).isHexadecimal().isLength({ max: 64 }).withMessage("This invite link is not valid"),
];

export const listRegistrationsRules: ValidationChain[] = [
  query("status").optional({ checkFalsy: true }).isIn(REGISTRATION_STATUSES).withMessage("Unknown status"),
];

export const registrationIdRules: ValidationChain[] = [idParamRule];
export const rejectRules: ValidationChain[] = [idParamRule, body("reason").optional().isString().trim().isLength({ max: 1000 })];
export const approveRules: ValidationChain[] = [idParamRule, body("plan").optional().isIn(["contract", "commission"]).withMessage("Choose a plan")];
export const askRules: ValidationChain[] = [idParamRule, body("message").isString().trim().isLength({ min: 5, max: 2000 }).withMessage("Write your question (at least 5 characters)")];
export const settingsRules: ValidationChain[] = [
  body("testPhase").optional().isBoolean().withMessage("testPhase must be true or false").toBoolean(),
  body("features.vouchers").optional().isBoolean().toBoolean(),
  body("features.advertising").optional().isBoolean().toBoolean(),
  body("features.reviews").optional().isBoolean().toBoolean(),
];
