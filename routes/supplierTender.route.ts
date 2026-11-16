import { Router } from "express";
import { getInvitation, listInvitations, submitOffer } from "../controllers/supplierTender.controller";
import { supplierOnly } from "../middleware/auth";
import { offerUpload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { offerRules, tenderIdRules } from "../validators/tender.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: SupplierTenders
 *   description: Requests the signed-in supplier was invited to, and their quotes — briefing §4.5–4.6
 */

/**
 * @swagger
 * /supplier-tenders:
 *   get:
 *     summary: Every request this supplier was invited to, with myStatus (open, submitted, won, lost, expired, cancelled) and myOffer
 *     tags: [SupplierTenders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Invitations }
 * /supplier-tenders/{id}:
 *   get:
 *     summary: One request with this supplier's quote
 *     tags: [SupplierTenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The request }
 * /supplier-tenders/{id}/offer:
 *   put:
 *     summary: Send or change the quote until the deadline (the hotel is emailed the first time)
 *     tags: [SupplierTenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [price]
 *             properties:
 *               price: { type: number }
 *               deliveryTime: { type: string }
 *               notes: { type: string }
 *               file: { type: string, format: binary, description: PDF or photo, max 5MB }
 *     responses:
 *       201: { description: Quote sent }
 *       200: { description: Quote updated }
 *       409: { description: The deadline has passed or the request is closed }
 */
router.get("/", supplierOnly, listInvitations);
router.get("/:id", supplierOnly, tenderIdRules, validate, getInvitation);
router.put("/:id/offer", supplierOnly, offerUpload.single("file"), offerRules, validate, submitOffer);

export default router;
