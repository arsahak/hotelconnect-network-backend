import { Router } from "express";
import { body } from "express-validator";
import { getPublicKey, subscribe, unsubscribe } from "../controllers/push.controller";
import { authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();
// Hotel managers and suppliers have an inbox; their devices can get push.
const members = [protect, authorize("hotel_manager", "supplier")];

const subscriptionRules = [
  body("endpoint").isURL({ protocols: ["https"], require_tld: false }).withMessage("Invalid push endpoint"),
  body("keys.p256dh").isString().isLength({ min: 20, max: 200 }),
  body("keys.auth").isString().isLength({ min: 8, max: 100 }),
];

/**
 * @swagger
 * tags:
 *   name: Push
 *   description: Push notifications for the dashboard PWA (hotel managers and suppliers)
 */

/**
 * @swagger
 * /push/public-key:
 *   get:
 *     summary: The VAPID public key for subscribing ("" when push is not set up)
 *     tags: [Push]
 *     responses:
 *       200: { description: "{ publicKey }" }
 * /push/subscribe:
 *   post:
 *     summary: Remember this device (a PushSubscription from the browser) and send a test push
 *     tags: [Push]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endpoint: { type: string }
 *               keys: { type: object, properties: { p256dh: { type: string }, auth: { type: string } } }
 *     responses:
 *       201: { description: Subscribed }
 *       503: { description: Push is not set up on the server }
 *   delete:
 *     summary: Forget this device
 *     tags: [Push]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Unsubscribed }
 */
router.get("/public-key", getPublicKey);
router.post("/subscribe", members, subscriptionRules, validate, subscribe);
router.delete("/subscribe", members, body("endpoint").isString(), validate, unsubscribe);

export default router;
