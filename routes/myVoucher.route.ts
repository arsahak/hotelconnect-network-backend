import { Router } from "express";
import {
  createMyVoucher,
  deleteMyVoucher,
  deleteMyVoucherImage,
  getMyVoucher,
  listMyVouchers,
  updateMyVoucher,
  uploadMyVoucherImage,
} from "../controllers/myVoucher.controller";
import { hotelOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParamRule } from "../validators/common.validator";
import { myVoucherRules } from "../validators/voucher.validator";
import { requireFeature } from "../middleware/feature";

const router = Router();
const manager = hotelOnly("hotel_manager");

/**
 * @swagger
 * tags:
 *   name: MyVouchers
 *   description: The signed-in hotel's own corporate vouchers (briefing §3.10) — public straight away
 */

/**
 * @swagger
 * /my-vouchers:
 *   get:
 *     summary: The hotel's own items, newest first
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List }
 *   post:
 *     summary: Add one (hotel, city and region come from the hotel)
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Created }
 * /my-vouchers/{id}:
 *   get:
 *     summary: One item of the hotel
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The item }
 *   patch:
 *     summary: Edit it
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Saved }
 *   delete:
 *     summary: Delete it
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Deleted }
 * /my-vouchers/{id}/image:
 *   put:
 *     summary: Upload or replace the photo (field "image")
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo updated }
 *   delete:
 *     summary: Remove the photo
 *     tags: [MyVouchers]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo removed }
 */
// Phase 2 (Master Briefing v4): hidden until an admin switches vouchers on.
router.use(requireFeature("vouchers"));
router.get("/", manager, listMyVouchers);
router.post("/", manager, myVoucherRules(true), validate, createMyVoucher);
router.get("/:id", manager, idParamRule, validate, getMyVoucher);
router.patch("/:id", manager, idParamRule, myVoucherRules(false), validate, updateMyVoucher);
router.delete("/:id", manager, idParamRule, validate, deleteMyVoucher);
router.put("/:id/image", manager, idParamRule, validate, upload.single("image"), uploadMyVoucherImage);
router.delete("/:id/image", manager, idParamRule, validate, deleteMyVoucherImage);

export default router;
