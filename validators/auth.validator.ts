import { body, type ValidationChain } from "express-validator";
import { OTP_LENGTH } from "../utils/otp";

const emailRule = body("email")
  .trim()
  .notEmpty()
  .withMessage("Email is required")
  .isEmail()
  .withMessage("Please enter a valid email address")
  .customSanitizer((value: string) => value.toLowerCase());

const otpRule = body("otp")
  .trim()
  .notEmpty()
  .withMessage("Code is required")
  .isLength({ min: OTP_LENGTH, max: OTP_LENGTH })
  .withMessage(`Code must be ${OTP_LENGTH} digits`)
  .isNumeric()
  .withMessage("Code must be numeric");

export const signinRules: ValidationChain[] = [
  emailRule,
  body("password").isString().notEmpty().withMessage("Password is required"),
];

export const forgotPasswordRules: ValidationChain[] = [emailRule];

export const verifyResetOtpRules: ValidationChain[] = [emailRule, otpRule];

export const resetPasswordRules: ValidationChain[] = [
  emailRule,
  body("resetToken")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Reset token is required"),
  body("newPassword")
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
];

export const handoffExchangeRules: ValidationChain[] = [
  body("code")
    .isString()
    .trim()
    .isLength({ min: 64, max: 64 })
    .isHexadecimal()
    .withMessage("Invalid sign-in code"),
];

export const twoFactorRules: ValidationChain[] = [
  body("challenge").isString().isLength({ min: 64, max: 64 }).isHexadecimal().withMessage("Please sign in again"),
  body("code").isString().trim().matches(/^[0-9]{6}$/).withMessage("The code has 6 digits"),
];
