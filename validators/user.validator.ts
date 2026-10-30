import { body, type ValidationChain } from "express-validator";
import { ADMIN_ROLES, PHONE_REGEX } from "../models/user.model";

const nameRules = (optional: boolean): ValidationChain[] => {
  const first = body("firstName").trim();
  const last = body("lastName").trim();
  return optional
    ? [
        first.optional().notEmpty().withMessage("First name cannot be empty"),
        last.optional(),
      ]
    : [
        first.notEmpty().withMessage("First name is required"),
        last.optional(),
      ];
};

const emailRule = (optional: boolean) => {
  const rule = body("email").trim();
  return (optional ? rule.optional({ checkFalsy: true }) : rule)
    .isEmail()
    .withMessage("Please enter a valid email address")
    .customSanitizer((value: string) => value.toLowerCase());
};

const phoneRule = body("phone")
  .optional({ checkFalsy: true })
  .trim()
  .matches(PHONE_REGEX)
  .withMessage("Please enter a valid phone number");

const adminRoleRule = (optional: boolean) => {
  const rule = body("role");
  return (optional ? rule.optional() : rule)
    .isIn(ADMIN_ROLES)
    .withMessage(`Role must be one of: ${ADMIN_ROLES.join(", ")}`);
};

/** Adding someone to the platform team (admin / superadmin). */
export const createTeamMemberRules: ValidationChain[] = [
  ...nameRules(false),
  emailRule(false),
  phoneRule,
  body("password")
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
  adminRoleRule(false),
];

export const updateTeamMemberRules: ValidationChain[] = [
  ...nameRules(true),
  emailRule(true),
  phoneRule,
  adminRoleRule(true),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be true or false")
    .toBoolean(),
];

/** Anyone editing their own account. */
export const updateMeRules: ValidationChain[] = [
  ...nameRules(true),
  emailRule(true),
  phoneRule,
];

export const changePasswordRules: ValidationChain[] = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("New password must be between 8 and 72 characters"),
];
