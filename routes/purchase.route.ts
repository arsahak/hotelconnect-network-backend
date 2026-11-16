import { Router } from "express";
import {
  adminCreateAction,
  adminDeleteAction,
  adminDownloadInvoice,
  adminDownloadZip,
  adminGetAction,
  adminListActions,
  adminUpdateAction,
  joinAction,
  listActions,
  withdrawAction,
} from "../controllers/purchase.controller";
import { adminOnly, purchasingMember } from "../middleware/auth";
import { invoiceUpload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParamRule } from "../validators/common.validator";
import { joinRules, participationFileRules, purchaseActionRules } from "../validators/purchase.validator";

const router = Router();
// Hotel managers and suppliers with a maintenance contract (client, 31 Oct).
const manager = purchasingMember;

/**
 * @swagger
 * tags:
 *   name: Purchasing
 *   description: Collectieve inkoop (briefing §3.13). Hotel managers join actions; admins run them.
 */

/**
 * @swagger
 * /purchasing/admin:
 *   get:
 *     summary: Every action with its number of participants (admins)
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Actions }
 *   post:
 *     summary: Create an action (admins)
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PurchaseAction' }
 *     responses:
 *       201: { description: Created }
 * /purchasing/admin/{id}:
 *   get:
 *     summary: One action with its participants (hotel, supplier, contract end, usage, invoice name)
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The action }
 *   patch:
 *     summary: Edit an action; "completed" starts the 90-day countdown for deleting the invoices
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Saved }
 *   delete:
 *     summary: Delete an action with its participants and invoices
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Deleted }
 * /purchasing/admin/{id}/zip:
 *   get:
 *     summary: Every invoice of the action in one ZIP file
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: application/zip }
 *       404: { description: No invoices }
 * /purchasing/admin/{id}/participants/{pid}/invoice:
 *   get:
 *     summary: One hotel's invoice (PDF)
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: pid, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: application/pdf }
 */
router.get("/admin", adminOnly, adminListActions);
router.post("/admin", adminOnly, purchaseActionRules(true), validate, adminCreateAction);
router.get("/admin/:id", adminOnly, idParamRule, validate, adminGetAction);
router.patch("/admin/:id", adminOnly, idParamRule, purchaseActionRules(false), validate, adminUpdateAction);
router.delete("/admin/:id", adminOnly, idParamRule, validate, adminDeleteAction);
router.get("/admin/:id/zip", adminOnly, idParamRule, validate, adminDownloadZip);
router.get("/admin/:id/participants/:pid/invoice", adminOnly, participationFileRules, validate, adminDownloadInvoice);

/**
 * @swagger
 * /purchasing:
 *   get:
 *     summary: Every action with participants, joinable, and the hotel's own participation
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Actions }
 * /purchasing/{id}/join:
 *   post:
 *     summary: Join with the latest annual invoice (multipart); at the target number the status turns to negotiating
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [currentSupplier, contractEndDate, invoice]
 *             properties:
 *               currentSupplier: { type: string }
 *               contractEndDate: { type: string, format: date }
 *               annualUsage: { type: string }
 *               invoice: { type: string, format: binary, description: PDF, max 10MB }
 *     responses:
 *       201: { description: Joined }
 *       409: { description: Closed, or already joined }
 *   delete:
 *     summary: Withdraw while the action is open (the invoice is deleted)
 *     tags: [Purchasing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Withdrawn }
 */
router.get("/", manager, listActions);
router.post("/:id/join", manager, invoiceUpload.single("invoice"), joinRules, validate, joinAction);
router.delete("/:id/join", manager, idParamRule, validate, withdrawAction);

export default router;
