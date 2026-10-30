import { Router } from "express";
import {
  createMyVacancy,
  deleteMyVacancy,
  deleteMyVacancyImage,
  getMyVacancy,
  listMyVacancies,
  updateMyVacancy,
  uploadMyVacancyImage,
} from "../controllers/myVacancy.controller";
import { hotelOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParamRule } from "../validators/common.validator";
import { myVacancyRules } from "../validators/vacancy.validator";

const router = Router();
const manager = hotelOnly("hotel_manager");

/**
 * @swagger
 * tags:
 *   name: MyVacancies
 *   description: The signed-in hotel's own jobs (briefing §3.7) — new and reopened jobs wait for an admin
 */

/**
 * @swagger
 * /my-vacancies:
 *   get:
 *     summary: The hotel's own items, newest first
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List }
 *   post:
 *     summary: Add one (hotel, city and region come from the hotel)
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Created }
 * /my-vacancies/{id}:
 *   get:
 *     summary: One item of the hotel
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The item }
 *   patch:
 *     summary: Edit it
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Saved }
 *   delete:
 *     summary: Delete it
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Deleted }
 * /my-vacancies/{id}/image:
 *   put:
 *     summary: Upload or replace the photo (field "image")
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo updated }
 *   delete:
 *     summary: Remove the photo
 *     tags: [MyVacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo removed }
 */
router.get("/", manager, listMyVacancies);
router.post("/", manager, myVacancyRules(true), validate, createMyVacancy);
router.get("/:id", manager, idParamRule, validate, getMyVacancy);
router.patch("/:id", manager, idParamRule, myVacancyRules(false), validate, updateMyVacancy);
router.delete("/:id", manager, idParamRule, validate, deleteMyVacancy);
router.put("/:id/image", manager, idParamRule, validate, upload.single("image"), uploadMyVacancyImage);
router.delete("/:id/image", manager, idParamRule, validate, deleteMyVacancyImage);

export default router;
