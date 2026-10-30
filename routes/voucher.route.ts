import { Router } from "express";
import {
  adminGetVoucher,
  adminListVouchers,
  createVoucher,
  deleteVoucher,
  deleteVoucherImage,
  listFeaturedVouchers,
  memberVouchers,
  signedInMemberVouchers,
  updateVoucher,
  voucherBooking,
  uploadVoucherImage,
} from "../controllers/voucher.controller";
import { adminOnly, supplierOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { rateLimit } from "../middleware/rateLimit";
import { env } from "../config/env";
import { adminListVouchersRules, memberAccessRules, voucherBodyRules, voucherIdRules } from "../validators/voucher.validator";

const router = Router();

// Member numbers are short, so slow down anyone trying them one by one.
const memberLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  message: "Too many attempts. Please try again in a few minutes.",
  enabled: env.isProduction,
});

/**
 * @swagger
 * tags:
 *   name: Vouchers
 *   description: Corporate vouchers from member hotels
 */

/**
 * @swagger
 * /vouchers/featured:
 *   get:
 *     summary: Slideshow vouchers (public, no booking links)
 *     description: Up to 10 — paid promotions first, then the newest.
 *     tags: [Vouchers]
 *     responses:
 *       200:
 *         description: VoucherTeaser[] with a `promoted` flag
 */
router.get("/featured", listFeaturedVouchers);

/**
 * @swagger
 * /vouchers/member-access:
 *   post:
 *     summary: All vouchers with booking links, for a valid supplier member number
 *     tags: [Vouchers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberNumber]
 *             properties:
 *               memberNumber: { type: string, example: L001 }
 *     responses:
 *       200:
 *         description: "{ member: { memberNumber, name }, vouchers: Voucher[] }"
 *       403:
 *         description: Member number unknown or not active
 *       422:
 *         description: Not a supplier member number
 */
router.post("/member-access", memberLimiter, memberAccessRules, validate, memberVouchers);

/**
 * @swagger
 * /vouchers/member:
 *   get:
 *     summary: All vouchers with booking links, for the supplier signed in on the website
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "{ member: { memberNumber, name }, vouchers: Voucher[] }"
 *       401: { description: Not signed in }
 *       403: { description: Not a supplier, or the supplier is not active }
 * /vouchers/{id}/booking:
 *   get:
 *     summary: The hotel's booking link of one voucher ("Boek nu"), for a signed-in supplier
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "{ bookingUrl }" }
 *       404: { description: Voucher not found or not active }
 */
router.get("/member", supplierOnly, signedInMemberVouchers);
router.get("/:id/booking", supplierOnly, voucherIdRules, validate, voucherBooking);

// ── Admin ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /vouchers/admin:
 *   get:
 *     summary: All vouchers (admins)
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: hotel, schema: { type: string } }
 *       - { in: query, name: active, schema: { type: boolean } }
 *     responses:
 *       200: { description: "{ items, total, page, pages, limit }" }
 *   post:
 *     summary: Add a voucher (region comes from the hotel)
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hotel, title, discountPercent, category, bookingUrl]
 *             properties:
 *               hotel: { type: string }
 *               title: { type: string }
 *               teaser: { type: string }
 *               description: { type: string }
 *               discountPercent: { type: integer }
 *               category: { type: string, enum: [Meeting, Stay, Dining, Gift] }
 *               bookingUrl: { type: string }
 *               isActive: { type: boolean }
 *               promotedUntil: { type: string, format: date, nullable: true, description: Shown first in the slideshow until this date }
 *     responses:
 *       201: { description: Voucher created }
 */
router.get("/admin", adminOnly, adminListVouchersRules, validate, adminListVouchers);
router.post("/admin", adminOnly, voucherBodyRules(true), validate, createVoucher);

/**
 * @swagger
 * /vouchers/admin/{id}:
 *   get:
 *     summary: One voucher (admins)
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The voucher }
 *   patch:
 *     summary: Edit a voucher
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Voucher updated }
 *   delete:
 *     summary: Delete a voucher
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Voucher deleted }
 */
router.get("/admin/:id", adminOnly, voucherIdRules, validate, adminGetVoucher);
router.patch("/admin/:id", adminOnly, voucherIdRules, voucherBodyRules(false), validate, updateVoucher);
router.delete("/admin/:id", adminOnly, voucherIdRules, validate, deleteVoucher);

/**
 * @swagger
 * /vouchers/admin/{id}/image:
 *   put:
 *     summary: Upload or replace the voucher photo
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: Photo updated }
 *   delete:
 *     summary: Remove the voucher photo
 *     tags: [Vouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo removed }
 */
router.put("/admin/:id/image", adminOnly, voucherIdRules, validate, upload.single("image"), uploadVoucherImage);
router.delete("/admin/:id/image", adminOnly, voucherIdRules, validate, deleteVoucherImage);

export default router;
