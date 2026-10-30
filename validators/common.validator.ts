import { body, param, query, type ValidationChain } from "express-validator";

/** ?q=&page=&limit= shared by the public list routes. */
export const listQueryRules: ValidationChain[] = [
  query("q").optional().isString().trim().isLength({ max: 100 }).withMessage("Search text is too long"),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive number"),
  query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("limit must be between 1 and 50"),
];

/** An optional filter that must be one of a fixed list (empty = no filter). */
export const optionalIn = (field: string, values: readonly string[], label = field) =>
  query(field)
    .optional({ checkFalsy: true })
    .isIn(values)
    .withMessage(`${label} must be one of: ${values.join(", ")}`);

export const slugParamRule = param("slug")
  .isString()
  .trim()
  .matches(/^[a-z0-9-]{1,100}$/)
  .withMessage("Invalid link");

export const idParamRule = param("id").isMongoId().withMessage("Invalid id");

/** ?q=&page=&limit=&active= for the admin lists. */
export const adminListRules: ValidationChain[] = [
  ...listQueryRules,
  query("active").optional({ checkFalsy: true }).isIn(["true", "false"]).withMessage("active must be true or false"),
];

/** An optional URL field (empty is allowed). */
export const optionalUrl = (field: string, label: string) =>
  body(field)
    .optional({ checkFalsy: true })
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage(`${label} must be a full link starting with https://`);

/** An optional date: "" or null clears it, anything else must be a date. */
export const optionalDate = (field: string, label: string) =>
  body(field)
    .optional()
    .customSanitizer((value) => (value === "" || value === null ? null : value))
    .custom((value) => value === null || !Number.isNaN(Date.parse(value)))
    .withMessage(`${label} must be a date`);

/** An optional number: "" or null clears it. */
export const optionalNumber = (field: string, label: string, { min = 0, max = 1e9 } = {}) =>
  body(field)
    .optional()
    .customSanitizer((value) => (value === "" || value === null ? null : Number(value)))
    .custom((value) => value === null || (Number.isFinite(value) && value >= min && value <= max))
    .withMessage(`${label} must be a number from ${min} to ${max}`);
