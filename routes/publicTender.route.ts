import { Router } from "express";
import { countPublicTenders, getPublicTender, listPublicTenders } from "../controllers/publicTender.controller";
import { optionalSupplier } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamRule } from "../validators/common.validator";
import { publicTenderRules } from "../validators/tender.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Public tenders
 *   description: Open tenders on the public website (Master Briefing v4) — anonymous; a signed-in supplier also gets the hotel and contact email
 */

/**
 * @swagger
 * /public-tenders:
 *   get:
 *     summary: Open tenders, newest first (anonymous unless a supplier token is sent)
 *     tags: [Public tenders]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: country, schema: { type: string, example: NL } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ items, total, page, pages, limit, signedIn }" }
 */
router.get("/", optionalSupplier, publicTenderRules, validate, listPublicTenders);

/**
 * @swagger
 * /public-tenders/count:
 *   get:
 *     summary: Number of open tenders (the website menu shows Tenders only above 0)
 *     tags: [Public tenders]
 *     responses:
 *       200: { description: "{ open }" }
 */
router.get("/count", countPublicTenders);

/**
 * @swagger
 * /public-tenders/{id}:
 *   get:
 *     summary: One open tender (hotel + contact email only for a signed-in supplier)
 *     tags: [Public tenders]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The tender }
 *       404: { description: Closed or not found }
 */
router.get("/:id", optionalSupplier, [idParamRule], validate, getPublicTender);

export default router;
