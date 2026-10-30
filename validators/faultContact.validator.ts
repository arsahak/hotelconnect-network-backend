import { body, type ValidationChain } from "express-validator";
import { FAULT_TYPES } from "../config/constants";
import { PHONE_REGEX } from "../models/user.model";
import { idParamRule, optionalUrl } from "./common.validator";

/** Name, phone and fault type are needed; email, WhatsApp and website are optional. */
export const faultContactBodyRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("name").trim().isLength({ min: 2, max: 120 }).withMessage("Fill in the name of the party"),
    required("faultType").isIn(FAULT_TYPES).withMessage("Choose the type of fault"),
    required("phone")
      .trim()
      .customSanitizer((value: string) => value.replace(/[\s()-]/g, ""))
      .matches(PHONE_REGEX)
      .withMessage("Fill in a valid phone number"),
    body("whatsapp")
      .optional()
      .trim()
      .customSanitizer((value: string) => value.replace(/[^0-9]/g, ""))
      .matches(/^$|^[0-9]{8,15}$/)
      .withMessage("WhatsApp: digits with country code, e.g. 31612345678"),
    body("email")
      .optional({ checkFalsy: true })
      .trim()
      .isEmail()
      .withMessage("Fill in a valid email address")
      .customSanitizer((value: string) => value.toLowerCase()),
    optionalUrl("website", "Website or service form"),
    body("notes").optional().isString().trim().isLength({ max: 500 }),
  ];
};

export const faultContactIdRules: ValidationChain[] = [idParamRule];

/** Reporting a fault to the party by email (briefing §3.4.3, addition). */
export const reportFaultRules: ValidationChain[] = [
  idParamRule,
  body("description").optional().isString().trim().isLength({ max: 2000 }).withMessage("Description is too long"),
  body("location").optional().isString().trim().isLength({ max: 120 }),
  body("urgent").optional().isBoolean().toBoolean(),
];
