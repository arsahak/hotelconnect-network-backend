import { Router } from "express";
import { deleteMyLogo, getMySupplier, updateMySupplier, uploadMyLogo } from "../controllers/mySupplier.controller";
import { supplierOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { mySupplierRules } from "../validators/mySupplier.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: MySupplier
 *   description: The signed-in supplier's own profile (briefing §4.2, §4.7)
 */

/**
 * @swagger
 * /my-supplier:
 *   get:
 *     summary: The signed-in supplier's profile, incl. contact, emails and certificates
 *     tags: [MySupplier]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The supplier }
 *   patch:
 *     summary: Edit tagline, description, categories, regions, website, contact, emails (invoices, notifications) and certificate links
 *     tags: [MySupplier]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tagline: { type: string }
 *               description: { type: string, description: max 200 words }
 *               categories: { type: array, items: { type: string } }
 *               regions: { type: array, items: { type: string } }
 *               website: { type: string }
 *               contact: { type: object, properties: { person: { type: string }, email: { type: string }, phone: { type: string } } }
 *               emails: { type: object, properties: { invoices: { type: string }, notifications: { type: string } } }
 *               certificates: { type: array, items: { type: object, properties: { name: { type: string }, url: { type: string } } } }
 *     responses:
 *       200: { description: Profile saved }
 * /my-supplier/logo:
 *   put:
 *     summary: Upload or replace the logo (field "image")
 *     tags: [MySupplier]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { image: { type: string, format: binary } } }
 *     responses:
 *       200: { description: Logo updated }
 *   delete:
 *     summary: Remove the logo
 *     tags: [MySupplier]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logo removed }
 */
router.get("/", supplierOnly, getMySupplier);
router.patch("/", supplierOnly, mySupplierRules, validate, updateMySupplier);
router.put("/logo", supplierOnly, upload.single("image"), uploadMyLogo);
router.delete("/logo", supplierOnly, deleteMyLogo);

export default router;
