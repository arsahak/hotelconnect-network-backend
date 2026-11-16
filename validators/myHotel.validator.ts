import { body, param, type ValidationChain } from "express-validator";
import { COUNTRY_CODES, HOTEL_EMAIL_TYPES, REGIONS, REGISTRATION_NUMBER_REGEX, VAT_REGEX, NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from "../config/constants";
import { DEPARTMENTS, PHONE_REGEX, USER_LANGUAGES } from "../models/user.model";
import { optionalNumber, optionalUrl } from "./common.validator";

const optionalEmail = (field: string, label: string) =>
  body(field)
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage(`${label} must be a valid email address`)
    .customSanitizer((value: string) => value.toLowerCase());

/** What a hotel manager may change about their own hotel (not member number, featured, active). */
export const myHotelBodyRules: ValidationChain[] = [
  body("name").optional().trim().isLength({ min: 2, max: 120 }).withMessage("Hotel name must be 2–120 characters"),
  body("kvkNumber")
    .optional()
    .trim()
    .customSanitizer((value: string) => value.replace(/\s/g, ""))
    .matches(new RegExp(`^$|${REGISTRATION_NUMBER_REGEX.source}`))
    .withMessage("Fill in a valid KvK / registration number"),
  body("legalName").optional().isString().trim().isLength({ max: 120 }),
  body("vatNumber")
    .optional()
    .customSanitizer((value: unknown) => String(value ?? "").replace(/[\s.]/g, "").toUpperCase())
    .matches(new RegExp(`^$|${VAT_REGEX.source}`))
    .withMessage("Fill in a valid VAT number, e.g. NL123456789B01"),
  body("country").optional().isIn(COUNTRY_CODES).withMessage("Choose the country"),
  body("address").optional().trim().notEmpty().withMessage("Address cannot be empty"),
  body("postalCode").optional().trim().isLength({ max: 12 }),
  body("city").optional().trim().notEmpty().withMessage("City cannot be empty"),
  body("region").optional().isIn([...REGIONS, ""]).withMessage("Choose a region"),
  body("contactPerson").optional().isString().trim().isLength({ max: 100 }),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((value: string) => value.replace(/[\s()-]/g, ""))
    .matches(PHONE_REGEX)
    .withMessage("Phone must be a valid phone number"),
  body("description").optional().isString().trim().isLength({ max: 1000 }),
  optionalUrl("bookingUrl", "Booking page"),
  body("offer").optional().isString().trim().isLength({ max: 60 }),
  body("emails.general")
    .optional()
    .trim()
    .isEmail()
    .withMessage("General email must be a valid email address")
    .customSanitizer((value: string) => value.toLowerCase()),
  ...HOTEL_EMAIL_TYPES.filter((t) => t !== "general").map((type) => optionalEmail(`emails.${type}`, `${type} email`)),
  ...HOTEL_EMAIL_TYPES.map((type) => body(`notify.${type}`).optional().isBoolean().toBoolean()),
  ...NOTIFICATION_TYPES.map((type) =>
    body(`notificationChannels.${type}`).optional().isIn(NOTIFICATION_CHANNELS).withMessage("Choose email, dashboard or both")
  ),
  ...NOTIFICATION_TYPES.map((type) => body(`notificationPush.${type}`).optional().isBoolean().toBoolean()),
  optionalNumber("facilities.rooms", "Number of rooms", { max: 5000 }),
  ...["restaurant", "lift", "pool", "parking"].map((key) => body(`facilities.${key}`).optional().isBoolean().toBoolean()),
];

export const onboardingStepRules: ValidationChain[] = [
  body("step").isInt({ min: 1, max: 8 }).withMessage("Step must be 1 to 8").toInt(),
];

/** The hotel's shared staff login (briefing §3.6). */
export const staffLoginRules: ValidationChain[] = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Fill in a valid email address for the staff login")
    .customSanitizer((value: string) => value.toLowerCase()),
  body("password")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
];

/** 1-click invite: a contract id, or an email address (+ company name). */
export const invitePartnerRules: ValidationChain[] = [
  body("contract").optional({ checkFalsy: true }).isMongoId().withMessage("Unknown contract"),
  body("email").optional({ checkFalsy: true }).trim().isEmail().withMessage("Fill in a valid email address").customSanitizer((v: string) => v.toLowerCase()),
  body("company").optional().isString().trim().isLength({ max: 120 }),
];

const STAFF_ROLES = ["gm", "dept_manager", "staff"];

/** Staff accounts (Master Briefing v4). create = all required fields. */
export const staffRules = (create: boolean): ValidationChain[] => [
  ...(create ? [] : [param("id").isMongoId().withMessage("Unknown account")]),
  (create ? body("firstName") : body("firstName").optional()).isString().trim().isLength({ min: 1, max: 60 }).withMessage("Fill in the first name"),
  body("lastName").optional().isString().trim().isLength({ max: 60 }),
  ...(create ? [body("email").trim().isEmail().withMessage("Fill in a valid email address").customSanitizer((v: string) => v.toLowerCase())] : []),
  (create ? body("password") : body("password").optional({ checkFalsy: true })).isString().isLength({ min: 8, max: 72 }).withMessage("The password needs at least 8 characters"),
  (create ? body("hotelRole") : body("hotelRole").optional()).isIn(STAFF_ROLES).withMessage("Choose GM, department manager or staff"),
  body("department").optional().isIn([...DEPARTMENTS, ""]).withMessage("Choose a department"),
  body("language").optional({ nullable: true }).isIn([...USER_LANGUAGES, ""]).withMessage("Choose a language"),
  body("isActive").optional().isBoolean().toBoolean(),
];

export const staffIdRules: ValidationChain[] = [param("id").isMongoId().withMessage("Unknown account")];
