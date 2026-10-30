import { Router } from "express";
import {
  createPortalLink,
  deletePortalLink,
  getPortalLink,
  listPortalLinks,
  updatePortalLink,
} from "../controllers/portalLink.controller";
import { hotelOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { listPortalLinksRules, portalLinkBodyRules, portalLinkIdRules } from "../validators/portalLink.validator";

const router = Router();
// Briefing §3.11: only the hotel manager sees these.
const manager = hotelOnly("hotel_manager");

/**
 * @swagger
 * tags:
 *   name: PortalLinks
 *   description: Handige links & portalen of the signed-in hotel (hotel managers). Never stores passwords.
 */

/**
 * @swagger
 * /portal-links:
 *   get:
 *     summary: The hotel's portal links, by category then name
 *     tags: [PortalLinks]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: query, name: q, schema: { type: string } }]
 *     responses:
 *       200: { description: "PortalLink[]" }
 *   post:
 *     summary: Add a portal link
 *     tags: [PortalLinks]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PortalLink' }
 *     responses:
 *       201: { description: Link added }
 *       422: { description: Invalid input, or a password was sent }
 */
router.get("/", manager, listPortalLinksRules, validate, listPortalLinks);
router.post("/", manager, portalLinkBodyRules(true), validate, createPortalLink);

/**
 * @swagger
 * /portal-links/{id}:
 *   get:
 *     summary: One portal link
 *     tags: [PortalLinks]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The link }
 *   patch:
 *     summary: Edit a portal link
 *     tags: [PortalLinks]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Link saved }
 *   delete:
 *     summary: Delete a portal link
 *     tags: [PortalLinks]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Link deleted }
 */
router.get("/:id", manager, portalLinkIdRules, validate, getPortalLink);
router.patch("/:id", manager, portalLinkIdRules, portalLinkBodyRules(false), validate, updatePortalLink);
router.delete("/:id", manager, portalLinkIdRules, validate, deletePortalLink);

export default router;
