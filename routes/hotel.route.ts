import { Router } from "express";
import {
  adminGetHotel,
  adminListHotels,
  createHotel,
  createHotelManager,
  deleteHotel,
  deleteHotelUser,
  listHotelUsers,
  deleteHotelImage,
  getHotel,
  hotelOptions,
  listHotels,
  updateHotel,
  uploadHotelImage,
} from "../controllers/hotel.controller";
import { adminOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import {
  adminListHotelsRules,
  hotelBodyRules,
  hotelIdRules,
  hotelManagerRules,
  hotelSlugRules,
  hotelUserRules,
  listHotelsRules,
} from "../validators/hotel.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Hotels
 *   description: Public hotel guide
 */

/**
 * @swagger
 * /hotels:
 *   get:
 *     summary: List member hotels (hotel guide)
 *     tags: [Hotels]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string }, description: Search name, city or text }
 *       - { in: query, name: region, schema: { type: string }, description: Province, e.g. Utrecht }
 *       - { in: query, name: featured, schema: { type: boolean }, description: Only homepage hotels }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 12, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "{ items: Hotel[], total, page, pages, limit }"
 */
router.get("/", listHotelsRules, validate, listHotels);

// ── Admin (before /:slug, so "admin" is never read as a slug) ───────────────

/**
 * @swagger
 * /hotels/admin:
 *   get:
 *     summary: All hotels with private fields (admins)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string }, description: Name, city, member number or email }
 *       - { in: query, name: region, schema: { type: string } }
 *       - { in: query, name: active, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ items, total, page, pages, limit }" }
 *   post:
 *     summary: Add a hotel (gets the next member number, e.g. H0007)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, city, region, address, emails]
 *             properties:
 *               name: { type: string }
 *               city: { type: string }
 *               region: { type: string }
 *               address: { type: string }
 *               description: { type: string }
 *               bookingUrl: { type: string }
 *               offer: { type: string }
 *               featured: { type: boolean }
 *               isActive: { type: boolean }
 *               emails:
 *                 type: object
 *                 required: [general]
 *                 properties:
 *                   general: { type: string }
 *                   invoices: { type: string }
 *                   vacancies: { type: string }
 *                   faults: { type: string }
 *                   alerts: { type: string }
 *     responses:
 *       201: { description: Hotel created }
 *       422: { description: Validation failed }
 */
router.get("/admin", adminOnly, adminListHotelsRules, validate, adminListHotels);
router.post("/admin", adminOnly, hotelBodyRules(true), validate, createHotel);

/**
 * @swagger
 * /hotels/admin/options:
 *   get:
 *     summary: Every hotel as { _id, name, city, memberNumber, emails } for dropdowns (admins)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Hotel list }
 */
router.get("/admin/options", adminOnly, hotelOptions);

/**
 * @swagger
 * /hotels/admin/{id}:
 *   get:
 *     summary: One hotel with private fields and counts of its jobs/vouchers (admins)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The hotel }
 *       404: { description: Hotel not found }
 *   patch:
 *     summary: Edit a hotel (send only the fields that change)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Hotel updated }
 *   delete:
 *     summary: Delete a hotel with its jobs and vouchers
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Hotel deleted }
 */
router.get("/admin/:id", adminOnly, hotelIdRules, validate, adminGetHotel);
router.patch("/admin/:id", adminOnly, hotelIdRules, hotelBodyRules(false), validate, updateHotel);
router.delete("/admin/:id", adminOnly, hotelIdRules, validate, deleteHotel);

/**
 * @swagger
 * /hotels/admin/{id}/image:
 *   put:
 *     summary: Upload or replace the hotel photo (JPEG, PNG, WEBP or GIF, max 5MB)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: Photo updated }
 *   delete:
 *     summary: Remove the hotel photo
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo removed }
 */
router.put("/admin/:id/image", adminOnly, hotelIdRules, validate, upload.single("image"), uploadHotelImage);
router.delete("/admin/:id/image", adminOnly, hotelIdRules, validate, deleteHotelImage);

/**
 * @swagger
 * /hotels/admin/{id}/users:
 *   get:
 *     summary: The hotel's logins (manager and staff)
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Logins }
 *   post:
 *     summary: Create a hotel manager login for this hotel
 *     tags: [Hotels]
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
 * /hotels/admin/{id}/users/{userId}:
 *   delete:
 *     summary: Remove one of the hotel's logins
 *     tags: [Hotels]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Login removed }
 */
router.get("/admin/:id/users", adminOnly, hotelIdRules, validate, listHotelUsers);
router.post("/admin/:id/users", adminOnly, hotelManagerRules, validate, createHotelManager);
router.delete("/admin/:id/users/:userId", adminOnly, hotelUserRules, validate, deleteHotelUser);

/**
 * @swagger
 * /hotels/{slug}:
 *   get:
 *     summary: Get one hotel
 *     tags: [Hotels]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The hotel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Hotel' }
 *       404:
 *         description: Hotel not found
 */
router.get("/:slug", hotelSlugRules, validate, getHotel);

export default router;
