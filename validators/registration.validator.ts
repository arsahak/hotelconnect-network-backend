import { body, query, type ValidationChain } from "express-validator";
import { REGIONS, SUPPLIER_CATEGORIES, SUPPLIER_REGIONS } from "../config/constants";
import { REGISTRATION_STATUSES, SUPPLIER_PLANS } from "../models/registration.model";
import { PHONE_REGEX } from "../models/user.model";
import { idParamRule, optionalUrl } from "./common.validator";
import { listOf } from "./supplier.validator";

const isHotel = body("type").equals("hotel");
const isSupplier = body("type").equals("supplier");

/** Briefing §3.1 / §4.1: name, KVK, contact, general email (+ address for hotels, categories/regions for suppliers). */
export const registrationRules: ValidationChain[] = [
  body("type").isIn(["hotel", "supplier"]).withMessage("Choose hotel or supplier"),
  body("companyName").trim().isLength({ min: 2, max: 120 }).withMessage("Fill in your company name"),
  body("kvkNumber").trim().customSanitizer((v: string) => String(v ?? "").replace(/\s/g, "")).matches(/^[0-9]{8}$/).withMessage("The KVK number has 8 digits"),
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
  body("address").if(isHotel).trim().isLength({ min: 3, max: 200 }).withMessage("Fill in the hotel's address"),
  body("city").if(isHotel).trim().isLength({ min: 2, max: 80 }).withMessage("Fill in the city"),
  body("region").if(isHotel).isIn(REGIONS).withMessage("Choose the province"),
  listOf("categories", SUPPLIER_CATEGORIES, "Categories"),
  listOf("regions", SUPPLIER_REGIONS, "Regions"),
  body("categories").if(isSupplier).isArray({ min: 1 }).withMessage("Choose at least one category"),
  body("regions").if(isSupplier).isArray({ min: 1 }).withMessage("Choose at least one region"),
  body("plan").if(isSupplier).isIn(SUPPLIER_PLANS).withMessage("Choose a plan"),
  optionalUrl("website", "Website"),
];

export const listRegistrationsRules: ValidationChain[] = [
  query("status").optional({ checkFalsy: true }).isIn(REGISTRATION_STATUSES).withMessage("Unknown status"),
];

export const registrationIdRules: ValidationChain[] = [idParamRule];
export const rejectRules: ValidationChain[] = [idParamRule, body("reason").optional().isString().trim().isLength({ max: 1000 })];
export const settingsRules: ValidationChain[] = [body("testPhase").isBoolean().withMessage("testPhase must be true or false").toBoolean()];
