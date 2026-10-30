import { Router } from "express";
import { createPermit, deletePermit, getPermit, listPermits, updatePermit } from "../controllers/permit.controller";
import { hotelOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { listPermitsRules, permitBodyRules, permitIdRules } from "../validators/permit.validator";

const router = Router();
const manager = hotelOnly("hotel_manager");

/**
 * @swagger
 * tags:
 *   name: Permits
 *   description: Permits and certificates of the signed-in hotel (hotel managers)
 */

/**
 * @swagger
 * /permits:
 *   get:
 *     summary: The hotel's permits (soonest expiry first) and suggestions from its compliance profile
 *     tags: [Permits]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "{ items: Permit[], suggestions: string[] (keys, e.g. liquorLicence) }"
 *   post:
 *     summary: Add a permit or certificate
 *     tags: [Permits]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Permit' }
 *     responses:
 *       201: { description: Permit added }
 */
router.get("/", manager, listPermitsRules, validate, listPermits);
router.post("/", manager, permitBodyRules(true), validate, createPermit);

/**
 * @swagger
 * /permits/{id}:
 *   get:
 *     summary: One permit of the hotel
 *     tags: [Permits]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The permit }
 *   patch:
 *     summary: Edit a permit
 *     tags: [Permits]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Permit saved }
 *   delete:
 *     summary: Delete a permit
 *     tags: [Permits]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Permit deleted }
 */
router.get("/:id", manager, permitIdRules, validate, getPermit);
router.patch("/:id", manager, permitIdRules, permitBodyRules(false), validate, updatePermit);
router.delete("/:id", manager, permitIdRules, validate, deletePermit);

export default router;
