import { Router } from "express";
import {
  createFaultContact,
  deleteFaultContact,
  getFaultContact,
  listFaultContacts,
  reportFault,
  updateFaultContact,
} from "../controllers/faultContact.controller";
import { hotelOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { rateLimit } from "../middleware/rateLimit";
import { env } from "../config/env";
import { faultContactBodyRules, faultContactIdRules, reportFaultRules } from "../validators/faultContact.validator";

const router = Router();
const manager = hotelOnly("hotel_manager");
// Briefing §3.6: the staff login only sees the storingslijst.
const managerOrStaff = hotelOnly("hotel_manager", "hotel_staff");

const reportLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  message: "Too many fault reports. Please call the party instead.",
  enabled: env.isProduction,
});

/**
 * @swagger
 * tags:
 *   name: Fault contacts
 *   description: Storingslijst — who the hotel calls when something breaks
 */

/**
 * @swagger
 * /fault-contacts:
 *   get:
 *     summary: The hotel's storingslijst (managers and the staff login)
 *     tags: [Fault contacts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "FaultContact[]" }
 *   post:
 *     summary: Add a contact (managers)
 *     tags: [Fault contacts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FaultContact' }
 *     responses:
 *       201: { description: Contact added }
 */
router.get("/", managerOrStaff, listFaultContacts);
router.post("/", manager, faultContactBodyRules(true), validate, createFaultContact);

/**
 * @swagger
 * /fault-contacts/{id}:
 *   get:
 *     summary: One contact
 *     tags: [Fault contacts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The contact }
 *   patch:
 *     summary: Edit a contact (managers)
 *     tags: [Fault contacts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Contact saved }
 *   delete:
 *     summary: Delete a contact (managers)
 *     tags: [Fault contacts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Contact deleted }
 */
router.get("/:id", managerOrStaff, faultContactIdRules, validate, getFaultContact);
router.patch("/:id", manager, faultContactIdRules, faultContactBodyRules(false), validate, updateFaultContact);
router.delete("/:id", manager, faultContactIdRules, validate, deleteFaultContact);

/**
 * @swagger
 * /fault-contacts/{id}/report:
 *   post:
 *     summary: Report a fault — emails the party with the hotel's details (nothing is stored)
 *     tags: [Fault contacts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               location: { type: string, example: Room 12 }
 *               urgent: { type: boolean }
 *     responses:
 *       200: { description: Report sent }
 *       422: { description: The contact has no email address }
 */
router.post("/:id/report", managerOrStaff, reportLimiter, reportFaultRules, validate, reportFault);

export default router;
