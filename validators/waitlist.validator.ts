import { body, type ValidationChain } from "express-validator";
import { WAITLIST_TYPES } from "../models/waitlist.model";

export const joinWaitlistRules: ValidationChain[] = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .customSanitizer((value: string) => value.toLowerCase()),
  body("type")
    .isIn(WAITLIST_TYPES)
    .withMessage(`Type must be one of: ${WAITLIST_TYPES.join(", ")}`),
];
