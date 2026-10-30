import { Router } from "express";
import {
  signin,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  verifyTwoFactor,
  createHandoff,
  exchangeHandoff,
  getMember,
} from "../controllers/auth.controller";
import { supplierOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { rateLimit } from "../middleware/rateLimit";
import { env } from "../config/env";
import {
  signinRules,
  forgotPasswordRules,
  verifyResetOtpRules,
  resetPasswordRules,
  handoffExchangeRules,
  twoFactorRules,
} from "../validators/auth.validator";

const router = Router();

// Slows down password guessing. Off in development so testing isn't blocked.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  message: "Too many attempts. Please try again in a few minutes.",
  enabled: env.isProduction,
});

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Sign in and password reset for every dashboard user
 */

/**
 * @swagger
 * /auth/signin:
 *   post:
 *     summary: Sign in with email and password
 *     description: >
 *       One sign-in for admins, hotel managers, hotel staff and suppliers.
 *       The returned user's `role` decides which dashboard they see.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: maaike@hotelconnect.nl
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Signed in — returns { user, token }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       401:
 *         description: Invalid email or password
 *       403:
 *         description: Account is inactive
 *       422:
 *         description: Validation failed
 */
router.post("/signin", authLimiter, signinRules, validate, signin);

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     summary: Second sign-in step for admins — the code emailed after /auth/signin returned twoFactorRequired
 *     description: >
 *       For admin and superadmin accounts /auth/signin answers { twoFactorRequired, challenge, email }
 *       instead of a token and emails a 6-digit code (valid 10 minutes, 5 tries).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [challenge, code]
 *             properties:
 *               challenge: { type: string }
 *               code: { type: string, example: "123456" }
 *     responses:
 *       200: { description: "{ user, token }" }
 *       401: { description: Wrong or expired code }
 */
router.post("/2fa/verify", authLimiter, twoFactorRules, validate, verifyTwoFactor);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Start a password reset (emails a code)
 *     description: >
 *       Step 1 of 3. Emails a 4-digit code. Call again to resend (at most
 *       once per 60 seconds); each call replaces the previous code.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: maaike@hotelconnect.nl
 *     responses:
 *       200:
 *         description: Code sent
 *       403:
 *         description: Account is inactive
 *       404:
 *         description: No account with this email address
 *       429:
 *         description: Requested again too soon
 */
router.post(
  "/forgot-password",
  authLimiter,
  forgotPasswordRules,
  validate,
  forgotPassword
);

/**
 * @swagger
 * /auth/forgot-password/verify-otp:
 *   post:
 *     summary: Confirm the password-reset code
 *     description: >
 *       Step 2 of 3. A correct code returns a one-time `resetToken` (valid 15
 *       minutes) that /auth/reset-password requires.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *                 example: "4829"
 *     responses:
 *       200:
 *         description: Code verified — returns { email, resetToken, expiresInSeconds }
 *       400:
 *         description: No reset in progress, or the code is wrong/expired
 *       429:
 *         description: Too many incorrect attempts
 */
router.post(
  "/forgot-password/verify-otp",
  authLimiter,
  verifyResetOtpRules,
  validate,
  verifyResetOtp
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Set a new password
 *     description: Step 3 of 3. Requires the `resetToken` from the code step.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, resetToken, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *               resetToken:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: The reset has expired or the token is not valid
 */
router.post("/reset-password", resetPasswordRules, validate, resetPassword);

/**
 * @swagger
 * /auth/handoff:
 *   post:
 *     summary: One-time code to carry a supplier's dashboard sign-in to the website
 *     description: Valid for 60 seconds and can be used once. Only for supplier accounts.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: "{ code, expiresIn }" }
 *       403: { description: Not a supplier, or the supplier is not active }
 * /auth/handoff/exchange:
 *   post:
 *     summary: Exchange a one-time code for a token (called by the website's server)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200: { description: "{ token, member: { memberNumber, name } }" }
 *       401: { description: Code unknown, used or expired }
 * /auth/member:
 *   get:
 *     summary: The supplier signed in on the website
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ member: { memberNumber, name } }" }
 *       401: { description: Not signed in }
 */
router.post("/handoff", supplierOnly, createHandoff);
router.post("/handoff/exchange", authLimiter, handoffExchangeRules, validate, exchangeHandoff);
router.get("/member", supplierOnly, getMember);

export default router;
