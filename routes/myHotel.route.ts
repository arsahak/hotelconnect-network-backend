import { Router } from "express";
import {
  completeOnboarding,
  deleteMyHotelImage,
  deleteStaffLogin,
  getCalendar,
  getMyHotel,
  getStaffLogin,
  saveOnboardingStep,
  saveStaffLogin,
  updateMyHotel,
  uploadMyHotelImage,
} from "../controllers/myHotel.controller";
import { hotelOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { myHotelBodyRules, onboardingStepRules, staffLoginRules } from "../validators/myHotel.validator";

const router = Router();
const manager = hotelOnly("hotel_manager");
const managerOrStaff = hotelOnly("hotel_manager", "hotel_staff");

/**
 * @swagger
 * tags:
 *   name: My hotel
 *   description: The signed-in hotel's own profile, onboarding, calendar and staff login
 */

/**
 * @swagger
 * /my-hotel:
 *   get:
 *     summary: The signed-in user's hotel, with private fields and compliance suggestions
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The hotel }
 *       403: { description: Not a hotel account }
 *   patch:
 *     summary: Edit the hotel (company data, hotel type, guide profile, emails and routing)
 *     description: Member number, "featured" and "active" can only be changed by HotelConnect.
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               kvkNumber: { type: string, example: "12345678" }
 *               address: { type: string }
 *               city: { type: string }
 *               region: { type: string }
 *               contactPerson: { type: string }
 *               phone: { type: string }
 *               description: { type: string }
 *               bookingUrl: { type: string }
 *               offer: { type: string }
 *               emails: { type: object, description: "general, invoices, vacancies, faults, alerts" }
 *               notify: { type: object, description: "Per email type: true/false" }
 *               facilities: { type: object, description: "rooms, restaurant, lift, pool, parking" }
 *     responses:
 *       200: { description: Hotel saved }
 */
router.get("/", managerOrStaff, getMyHotel);
router.patch("/", manager, myHotelBodyRules, validate, updateMyHotel);

/**
 * @swagger
 * /my-hotel/image:
 *   put:
 *     summary: Upload or replace the hotel-guide photo
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
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
 *     summary: Remove the hotel-guide photo
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Photo removed }
 */
router.put("/image", manager, upload.single("image"), uploadMyHotelImage);
router.delete("/image", manager, deleteMyHotelImage);

/**
 * @swagger
 * /my-hotel/onboarding:
 *   patch:
 *     summary: Save how far the onboarding got (step 1–8)
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               step: { type: integer, minimum: 1, maximum: 8 }
 *     responses:
 *       200: { description: Progress saved }
 * /my-hotel/onboarding/complete:
 *   post:
 *     summary: Confirm the onboarding — the hotel can now use its dashboard
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Onboarding completed }
 *       422: { description: Required company data is missing }
 */
router.patch("/onboarding", manager, onboardingStepRules, validate, saveOnboardingStep);
router.post("/onboarding/complete", manager, completeOnboarding);

/**
 * @swagger
 * /my-hotel/calendar:
 *   get:
 *     summary: Year calendar — contract end dates, cancel deadlines and permit expiry dates
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "{ from, to, events[], overdue[], summary: { contracts, permits, faultContacts, costPerYear } }"
 */
router.get("/calendar", manager, getCalendar);

/**
 * @swagger
 * /my-hotel/staff-login:
 *   get:
 *     summary: The hotel's staff login (email only), or null
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ email, isActive, updatedAt } or null" }
 *   put:
 *     summary: Create the staff login, or change its email / password
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *               password: { type: string, description: "Required when creating; optional when changing" }
 *     responses:
 *       200: { description: Staff login saved }
 *       409: { description: Email already used }
 *   delete:
 *     summary: Remove the staff login
 *     tags: [My hotel]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Staff login removed }
 */
router.get("/staff-login", manager, getStaffLogin);
router.put("/staff-login", manager, staffLoginRules, validate, saveStaffLogin);
router.delete("/staff-login", manager, deleteStaffLogin);

export default router;
