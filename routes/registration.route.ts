import { Router } from "express";
import {
  approveRegistration,
  createRegistration,
  getPublicSettings,
  getRegistration,
  listRegistrations,
  rejectRegistration,
  updateSettings,
} from "../controllers/registration.controller";
import { adminOnly } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { env } from "../config/env";
import { listRegistrationsRules, registrationIdRules, registrationRules, rejectRules, settingsRules } from "../validators/registration.validator";

// Mounted twice in routes/index.ts: /settings and /registrations.
export const settingsRouter = Router();
export const registrationRouter = Router();

const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  message: "Too many registrations from this connection. Please try again later.",
  enabled: env.isProduction,
});

/**
 * @swagger
 * tags:
 *   name: Registration
 *   description: Test phase switch and sign-ups of new hotels and suppliers (briefing §1, §3.1, §4.1)
 */

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Public platform settings ({ testPhase })
 *     tags: [Registration]
 *     responses:
 *       200: { description: "{ testPhase: boolean }" }
 *   patch:
 *     summary: Turn the test phase on (registration closed) or off (admins)
 *     tags: [Registration]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [testPhase], properties: { testPhase: { type: boolean } } }
 *     responses:
 *       200: { description: Saved }
 */
settingsRouter.get("/", getPublicSettings);
settingsRouter.patch("/", adminOnly, settingsRules, validate, updateSettings);

/**
 * @swagger
 * /registrations:
 *   post:
 *     summary: Register a hotel or supplier (only after the test phase; an admin approves it)
 *     tags: [Registration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Registration' }
 *     responses:
 *       201: { description: Registration received }
 *       403: { description: Test phase — registration closed }
 *       409: { description: Email already registered }
 * /registrations/admin:
 *   get:
 *     summary: Registrations (?status=pending|approved|rejected) and the number pending (admins)
 *     tags: [Registration]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, pending }" }
 * /registrations/admin/{id}:
 *   get:
 *     summary: One registration (admins)
 *     tags: [Registration]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The registration }
 * /registrations/admin/{id}/approve:
 *   post:
 *     summary: Approve — creates the hotel or supplier with a member number and its login, and emails the applicant
 *     tags: [Registration]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "{ memberNumber }" }
 * /registrations/admin/{id}/reject:
 *   post:
 *     summary: Reject with an optional reason (emailed to the applicant)
 *     tags: [Registration]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Rejected }
 */
registrationRouter.post("/", signupLimiter, registrationRules, validate, createRegistration);
registrationRouter.get("/admin", adminOnly, listRegistrationsRules, validate, listRegistrations);
registrationRouter.get("/admin/:id", adminOnly, registrationIdRules, validate, getRegistration);
registrationRouter.post("/admin/:id/approve", adminOnly, registrationIdRules, validate, approveRegistration);
registrationRouter.post("/admin/:id/reject", adminOnly, rejectRules, validate, rejectRegistration);
