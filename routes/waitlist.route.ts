import { Router } from "express";
import { joinWaitlist } from "../controllers/waitlist.controller";
import { validate } from "../middleware/validate";
import { rateLimit } from "../middleware/rateLimit";
import { env } from "../config/env";
import { joinWaitlistRules } from "../validators/waitlist.validator";

const router = Router();

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: "Too many sign-ups from this connection. Please try again later.",
  enabled: env.isProduction,
});

/**
 * @swagger
 * tags:
 *   name: Waitlist
 *   description: Test-phase waitlist
 */

/**
 * @swagger
 * /waitlist:
 *   post:
 *     summary: Join the waitlist
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, type]
 *             properties:
 *               email: { type: string, example: info@hotel.nl }
 *               type: { type: string, enum: [hotel, supplier] }
 *     responses:
 *       201:
 *         description: Added to the waitlist
 *       200:
 *         description: Already on the waitlist
 *       422:
 *         description: Validation failed
 */
router.post("/", waitlistLimiter, joinWaitlistRules, validate, joinWaitlist);

export default router;
