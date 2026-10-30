import { Router } from "express";
import { inboxOwner, listNotifications, markAllRead, markRead, unreadCount } from "../controllers/notification.controller";
import { protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamRule } from "../validators/common.validator";

const router = Router();
const inbox = [protect, inboxOwner];

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: The dashboard inbox of a hotel manager or supplier (briefing §3.12, §4.4)
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: The newest 50 meldingen and the unread count (?unread=true for unread only)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: query, name: unread, schema: { type: boolean } }]
 *     responses:
 *       200: { description: "{ items: Notification[], unread: number }" }
 *       403: { description: Admins and hotel staff have no inbox }
 * /notifications/unread-count:
 *   get:
 *     summary: Number of unread meldingen (for the bell in the top bar)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ unread: number }" }
 * /notifications/read-all:
 *   post:
 *     summary: Mark every melding as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All marked as read }
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark one melding as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Marked as read }
 */
router.get("/", inbox, listNotifications);
router.get("/unread-count", inbox, unreadCount);
router.post("/read-all", inbox, markAllRead);
router.post("/:id/read", inbox, idParamRule, validate, markRead);

export default router;
