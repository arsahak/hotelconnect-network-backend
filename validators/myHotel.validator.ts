import { body, type ValidationChain } from "express-validator";
import { HOTEL_EMAIL_TYPES, REGIONS, NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from "../config/constants";
import { PHONE_REGEX } from "../models/user.model";
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
    .matches(/^$|^[0-9]{8}$/)
    .withMessage("KVK number has 8 digits"),
  body("address").optional().trim().notEmpty().withMessage("Address cannot be empty"),
  body("city").optional().trim().notEmpty().withMessage("City cannot be empty"),
  body("region").optional().isIn(REGIONS).withMessage("Choose a region"),
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
