import { Router } from "express";
import {
  adminGetSupplier,
  adminListSuppliers,
  createSupplier,
  deleteSupplier,
  deleteSupplierPicture,
  getSupplier,
  listSuppliers,
  updateSupplier,
  createSupplierLogin,
  deleteSupplierUser,
  listSupplierUsers,
  uploadSupplierPicture,
} from "../controllers/supplier.controller";
import { adminOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import {
  adminListSuppliersRules,
  listSuppliersRules,
  supplierBodyRules,
  supplierIdRules,
  supplierLoginRules,
  supplierSlugRules,
  supplierUserRules,
} from "../validators/supplier.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Suppliers
 *   description: Public supplier directory (no contact details)
 */

/**
 * @swagger
 * /suppliers:
 *   get:
 *     summary: List suppliers (directory, homepage slideshow, purchasing page)
 *     tags: [Suppliers]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string }, description: e.g. Laundry }
 *       - { in: query, name: region, schema: { type: string }, description: Nationwide suppliers match every province }
 *       - { in: query, name: featured, schema: { type: boolean }, description: Only the homepage slideshow }
 *       - { in: query, name: purchasing, schema: { type: boolean }, description: Only the purchasing-page ads }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 24, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "{ items: Supplier[], total, page, pages, limit }"
 */
router.get("/", listSuppliersRules, validate, listSuppliers);

// ── Admin (before /:slug) ───────────────────────────────────────────────────

/**
 * @swagger
 * /suppliers/admin:
 *   get:
 *     summary: All suppliers with contact details (admins)
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: active, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ items, total, page, pages, limit }" }
 *   post:
 *     summary: Add a supplier (gets the next member number, e.g. L009)
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, contact]
 *             properties:
 *               name: { type: string }
 *               tagline: { type: string, maxLength: 200 }
 *               description: { type: string, description: Max 200 words }
 *               categories: { type: array, items: { type: string } }
 *               regions: { type: array, items: { type: string } }
 *               website: { type: string }
 *               featured: { type: boolean }
 *               showInPurchasing: { type: boolean }
 *               isActive: { type: boolean }
 *               contact:
 *                 type: object
 *                 required: [email]
 *                 properties:
 *                   person: { type: string }
 *                   email: { type: string }
 *                   phone: { type: string }
 *     responses:
 *       201: { description: Supplier created }
 */
router.get("/admin", adminOnly, adminListSuppliersRules, validate, adminListSuppliers);
router.post("/admin", adminOnly, supplierBodyRules(true), validate, createSupplier);

/**
 * @swagger
 * /suppliers/admin/{id}:
 *   get:
 *     summary: One supplier with contact details (admins)
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The supplier }
 *   patch:
 *     summary: Edit a supplier (send only the fields that change)
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Supplier updated }
 *   delete:
 *     summary: Delete a supplier
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Supplier deleted }
 */
router.get("/admin/:id", adminOnly, supplierIdRules, validate, adminGetSupplier);
router.patch("/admin/:id", adminOnly, supplierIdRules, supplierBodyRules(false), validate, updateSupplier);
router.delete("/admin/:id", adminOnly, supplierIdRules, validate, deleteSupplier);

/**
 * @swagger
 * /suppliers/admin/{id}/{picture}:
 *   put:
 *     summary: Upload or replace the logo or the large photo (field name "image")
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: picture, required: true, schema: { type: string, enum: [logo, image] } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: Picture updated }
 *   delete:
 *     summary: Remove the logo or the large photo
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: picture, required: true, schema: { type: string, enum: [logo, image] } }
 *     responses:
 *       200: { description: Picture removed }
 */
for (const picture of ["logo", "image"] as const) {
  router.put(`/admin/:id/${picture}`, adminOnly, supplierIdRules, validate, upload.single("image"), uploadSupplierPicture(picture));
  router.delete(`/admin/:id/${picture}`, adminOnly, supplierIdRules, validate, deleteSupplierPicture(picture));
}

/**
 * @swagger
 * /suppliers/admin/{id}/users:
 *   get:
 *     summary: The supplier's logins
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Logins }
 *   post:
 *     summary: Create a login for this supplier (dashboard + booking vouchers on the website)
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, email, password]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: Login created }
 *       409: { description: Email already registered }
 * /suppliers/admin/{id}/users/{userId}:
 *   delete:
 *     summary: Remove one of the supplier's logins
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Login removed }
 */
router.get("/admin/:id/users", adminOnly, supplierIdRules, validate, listSupplierUsers);
router.post("/admin/:id/users", adminOnly, supplierLoginRules, validate, createSupplierLogin);
router.delete("/admin/:id/users/:userId", adminOnly, supplierUserRules, validate, deleteSupplierUser);

/**
 * @swagger
 * /suppliers/{slug}:
 *   get:
 *     summary: Get one supplier profile
 *     tags: [Suppliers]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The supplier
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Supplier' }
 *       404:
 *         description: Supplier not found
 */
router.get("/:slug", supplierSlugRules, validate, getSupplier);

export default router;
