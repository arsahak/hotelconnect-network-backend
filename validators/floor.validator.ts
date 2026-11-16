import { body, param, query, type ValidationChain } from "express-validator";
import { CHECKLISTS, SHIFTS, WASTE_REASONS } from "../models/floor.model";
import { DEPARTMENTS } from "../models/user.model";
import { idParamRule, optionalDate } from "./common.validator";

const department = (field = "department") => body(field).optional().isIn([...DEPARTMENTS, ""]).withMessage("Choose a department");

export const logRules: ValidationChain[] = [
  body("kind").isIn(["handover", "appointment"]).withMessage("Handover note or appointment"),
  body("text").isString().trim().isLength({ min: 2, max: 300 }).withMessage("Write a short note (max 300 characters)"),
  body("time").optional({ checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage("Time as HH:MM"),
  optionalDate("date", "Date"),
  department(),
];

export const spaceRules = (create: boolean): ValidationChain[] => [
  ...(create
    ? [body("name").if(body("range").not().exists()).isString().trim().isLength({ min: 1, max: 60 }).withMessage("Fill in a name or number"), body("range").optional().matches(/^\s*\d+\s*-\s*\d+\s*$/).withMessage("Use a range like 101-120")]
    : [idParamRule, body("name").optional().isString().trim().isLength({ min: 1, max: 60 })]),
  body("kind").optional().isIn(["room", "space"]),
  body("floor").optional().isString().trim().isLength({ max: 20 }),
  body("waterPoint").optional().isBoolean().toBoolean(),
  body("vacantSince").optional({ nullable: true }).custom((v) => v === null || v === "" || !Number.isNaN(Date.parse(v))).withMessage("Unknown date").customSanitizer((v) => (v ? new Date(v) : null)),
  body("specs").optional().isString().trim().isLength({ max: 2000 }),
];

export const issueRules: ValidationChain[] = [
  body("title").isString().trim().isLength({ min: 2, max: 200 }).withMessage("Describe the issue"),
  body("space").optional({ checkFalsy: true }).isMongoId(),
  body("location").optional().isString().trim().isLength({ max: 80 }),
  department(),
  body("outOfOrder").optional().isBoolean().toBoolean(),
];

export const listParamRule = param("list").isIn(CHECKLISTS).withMessage("Unknown checklist");

export const entryRules: ValidationChain[] = [
  listParamRule,
  body("item").optional({ checkFalsy: true }).isMongoId(),
  body("space").optional({ checkFalsy: true }).isMongoId(),
  body("value").optional({ nullable: true, checkFalsy: false }).custom((v) => v === "" || v === null || Number.isFinite(Number(v))).withMessage("Temperature must be a number"),
  body("value2").optional({ nullable: true }).custom((v) => v === "" || v === null || Number.isFinite(Number(v))).withMessage("Temperature must be a number"),
  body("shift").optional().isIn([...SHIFTS, ""]),
  body("done").optional().isBoolean().toBoolean(),
  body("note").optional().isString().trim().isLength({ max: 300 }),
  optionalDate("date", "Date"),
];

export const itemRules = (create: boolean): ValidationChain[] => [
  ...(create ? [listParamRule] : [idParamRule]),
  (create ? body("label") : body("label").optional()).isString().trim().isLength({ min: 2, max: 160 }).withMessage("Name the item"),
  body("section").optional().isString().trim().isLength({ max: 80 }),
  body("kind").optional().isIn(["temp", "check"]),
  department(),
  body("maxC").optional({ nullable: true }).custom((v) => v === null || v === "" || Number.isFinite(Number(v))).customSanitizer((v) => (v === "" || v == null ? null : Number(v))),
  body("minC").optional({ nullable: true }).custom((v) => v === null || v === "" || Number.isFinite(Number(v))).customSanitizer((v) => (v === "" || v == null ? null : Number(v))),
  body("intervalDays").optional({ nullable: true }).custom((v) => v === null || v === "" || (Number.isInteger(Number(v)) && Number(v) >= 1)).customSanitizer((v) => (v === "" || v == null ? null : Number(v))),
  body("external").optional().isBoolean().toBoolean(),
  optionalDate("nextDue", "Next due date"),
  body("active").optional().isBoolean().toBoolean(),
];

export const wasteRules: ValidationChain[] = [
  body("product").isString().trim().isLength({ min: 1, max: 120 }).withMessage("Fill in the product"),
  body("quantity").isString().trim().isLength({ min: 1, max: 40 }).withMessage("Fill in the quantity or weight"),
  body("reason").isIn(WASTE_REASONS).withMessage("Choose a reason"),
  optionalDate("date", "Date"),
];

export const productRules: ValidationChain[] = [
  body("name").optional().isString().trim().isLength({ min: 1, max: 120 }).withMessage("Fill in the product name"),
  department(),
  body("supplierName").optional().isString().trim().isLength({ max: 120 }),
  body("supplierPhone").optional().isString().trim().isLength({ max: 30 }),
  body("supplierEmail").optional({ checkFalsy: true }).trim().isEmail().withMessage("Fill in a valid email address"),
];

export const requestRules: ValidationChain[] = [
  body("product").isMongoId().withMessage("Choose a product"),
  body("quantity").optional().isInt({ min: 1, max: 1000 }).toInt(),
  body("note").optional().isString().trim().isLength({ max: 200 }),
];

export const requestStatusRules: ValidationChain[] = [idParamRule, body("status").isIn(["requested", "ordered", "received"]).withMessage("Unknown status")];

export const rangeRules: ValidationChain[] = [
  query("from").optional().isISO8601().withMessage("from as YYYY-MM-DD"),
  query("to").optional().isISO8601().withMessage("to as YYYY-MM-DD"),
];
