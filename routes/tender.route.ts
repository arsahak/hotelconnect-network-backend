import { Router } from "express";
import { awardTender, cancelTender, closeTender, createTender, getTender, listTenders, reviewTender, updateTender } from "../controllers/tender.controller";
import { hotelOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { awardRules, listTendersRules, reviewRules, tenderCreateRules, tenderIdRules, tenderUpdateRules } from "../validators/tender.validator";
import { requireFeature } from "../middleware/feature";
import { requireFullOnboarding } from "../middleware/onboarding";

const router = Router();
const manager = hotelOnly("hotel_manager");

/**
 * @swagger
 * tags:
 *   name: Tenders
 *   description: Tenders of the signed-in hotel (hotel managers) — briefing §3.5
 */

/**
 * @swagger
 * /tenders:
 *   get:
 *     summary: The hotel's tenders, newest first, with invitedCount and offerCount
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Tender[]" }
 *   post:
 *     summary: Send a tender to at most 3 suppliers with the same category and region (they are emailed)
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Tender' }
 *     responses:
 *       201: { description: Tender sent (invitedCount = number of suppliers) }
 */
router.get("/", manager, listTendersRules, validate, listTenders);
router.post("/", manager, requireFullOnboarding, tenderCreateRules, validate, createTender);

/**
 * @swagger
 * /tenders/{id}:
 *   get:
 *     summary: One tender with the invited suppliers and their quotes (cheapest first)
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "Tender & { offers: Offer[] }" }
 *   patch:
 *     summary: Change title, description, deadline or budget of an open tender
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Tender saved }
 *       409: { description: Tender is closed }
 * /tenders/{id}/award:
 *   post:
 *     summary: Choose the winning quote; the others lose and every supplier is emailed
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [offerId], properties: { offerId: { type: string } } }
 *     responses:
 *       200: { description: Winner chosen }
 * /tenders/{id}/cancel:
 *   post:
 *     summary: Cancel an open tender
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Tender cancelled }
 */
router.get("/:id", manager, tenderIdRules, validate, getTender);
router.patch("/:id", manager, tenderUpdateRules, validate, updateTender);
router.post("/:id/award", manager, awardRules, validate, awardTender);
router.post("/:id/cancel", manager, tenderIdRules, validate, cancelTender);

/**
 * @swagger
 * /tenders/{id}/close:
 *   post:
 *     summary: Close an open tender (Master Briefing v4) — it leaves the public Tenders page
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Closed }
 *       409: { description: Already closed }
 */
router.post("/:id/close", manager, tenderIdRules, validate, closeTender);

/**
 * @swagger
 * /tenders/{id}/review:
 *   put:
 *     summary: Rate the chosen supplier once the job is done (Kwaliteitsformulier); can be changed later
 *     tags: [Tenders]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Review' }
 *     responses:
 *       200: { description: Review saved; the supplier's ranking is updated }
 *       409: { description: No winner chosen yet }
 */
router.put("/:id/review", requireFeature("reviews"), manager, reviewRules, validate, reviewTender);

export default router;
