import { Router } from "express";
import { body, query } from "express-validator";
import { AD_BLOCKS, AD_PERIODS, PAYMENT_METHODS } from "../config/billing";
import { availability, adminBookings, book, cancel, myBookings, sponsored } from "../controllers/ads.controller";
import {
  adminCancelInvoice,
  adminCancelSubscription,
  adminListInvoices,
  adminMarkPaid,
  adminMemberBilling,
  adminStartSubscription,
  adminSetFounding,
  cancelMyMembership,
  changeMyPaymentMethod,
  mollieWebhook,
  myBilling,
} from "../controllers/billing.controller";
import { adminOnly, authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { INVOICE_KINDS, INVOICE_STATUSES } from "../models/invoice.model";
import { idParamRule } from "../validators/common.validator";
import { requireFeature } from "../middleware/feature";

const members = [protect, authorize("hotel_manager", "supplier")];

/**
 * @swagger
 * tags:
 *   - name: Billing
 *     description: Memberships, invoices (Facturen §3.9), commission and payments (Mollie, Moneybird)
 *   - name: Ads
 *     description: Sponsored homepage spots (briefing §2.1, §3.15, §4.9)
 */

// ── /billing ──
export const billingRouter = Router();

/**
 * @swagger
 * /billing/mine:
 *   get:
 *     summary: The signed-in member's membership, invoices and prices
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ subscription, invoices, plan, prices, online }" }
 * /billing/mine/cancel:
 *   post:
 *     summary: Cancel the membership (agreements §6) — ends at the end of the contract year, or a year later with less than 3 months' notice; suppliers in the free period leave at once
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cancelled }
 * /billing/mine/payment-method:
 *   patch:
 *     summary: SEPA direct debit (default) or paying each invoice by hand
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { paymentMethod: { type: string, enum: [sepa, invoice] } } }
 *     responses:
 *       200: { description: Saved }
 * /billing/admin/invoices:
 *   get:
 *     summary: All invoices (?status, ?kind, ?hotel, ?supplier) with totals per status (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, totals }" }
 * /billing/admin/invoices/{id}/paid:
 *   post:
 *     summary: Mark paid (bank transfer etc.); starts the ad it paid for (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Paid }
 * /billing/admin/invoices/{id}/cancel:
 *   post:
 *     summary: Cancel an open invoice (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Cancelled }
 * /billing/admin/member:
 *   get:
 *     summary: Membership and invoices of one hotel (?hotel=) or supplier (?supplier=) (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ subscription, invoices }" }
 * /billing/admin/subscriptions:
 *   post:
 *     summary: Start the paid membership of a hotel or supplier with a contract (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { hotel: { type: string }, supplier: { type: string }, interval: { type: string, enum: [month, year] } } }
 *     responses:
 *       201: { description: Started; the first invoice is raised }
 * /billing/admin/founding:
 *   post:
 *     summary: Mark a hotel (first 10, €490) or supplier (first 10–15, €500) as founding member (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { hotel: { type: string }, supplier: { type: string }, founding: { type: boolean } } }
 *     responses:
 *       200: { description: Saved }
 * /billing/admin/subscriptions/{id}/cancel:
 *   post:
 *     summary: Stop renewing a membership (admins)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Cancelled }
 */
billingRouter.get("/mine", members, myBilling);
billingRouter.post("/mine/cancel", members, cancelMyMembership);
billingRouter.patch("/mine/payment-method", members, body("paymentMethod").isIn(PAYMENT_METHODS).withMessage("Choose direct debit or invoice"), validate, changeMyPaymentMethod);
billingRouter.get(
  "/admin/invoices",
  adminOnly,
  query("status").optional({ checkFalsy: true }).isIn(INVOICE_STATUSES),
  query("kind").optional({ checkFalsy: true }).isIn(INVOICE_KINDS),
  validate,
  adminListInvoices
);
billingRouter.post("/admin/invoices/:id/paid", adminOnly, idParamRule, validate, adminMarkPaid);
billingRouter.post("/admin/invoices/:id/cancel", adminOnly, idParamRule, validate, adminCancelInvoice);
billingRouter.get("/admin/member", adminOnly, adminMemberBilling);
billingRouter.post(
  "/admin/subscriptions",
  adminOnly,
  body("hotel").optional().isMongoId(),
  body("supplier").optional().isMongoId(),
  validate,
  adminStartSubscription
);
billingRouter.post("/admin/subscriptions/:id/cancel", adminOnly, idParamRule, validate, adminCancelSubscription);
billingRouter.post(
  "/admin/founding",
  adminOnly,
  body("hotel").optional().isMongoId(),
  body("supplier").optional().isMongoId(),
  body("founding").isBoolean(),
  validate,
  adminSetFounding
);

// ── /payments ──
export const paymentsRouter = Router();

/**
 * @swagger
 * /payments/mollie/webhook:
 *   post:
 *     summary: Mollie webhook (form field "id"); the payment is fetched from Mollie before anything is marked paid
 *     tags: [Billing]
 *     responses:
 *       200: { description: Always 200 }
 */
paymentsRouter.post("/mollie/webhook", mollieWebhook);

// ── /ads ──
export const adsRouter = Router();

/**
 * @swagger
 * /ads/sponsored:
 *   get:
 *     summary: Live sponsored items per homepage block (public)
 *     tags: [Ads]
 *     responses:
 *       200: { description: "{ suppliers, hotels, jobs }" }
 * /ads/availability:
 *   get:
 *     summary: Per block and position — live until, waiting, next start; prices
 *     tags: [Ads]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Availability }
 * /ads/mine:
 *   get:
 *     summary: The signed-in member's bookings
 *     tags: [Ads]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Bookings }
 * /ads:
 *   post:
 *     summary: Book a spot (suppliers → suppliers block; hotels → hotels block or a published job in the jobs block)
 *     tags: [Ads]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               block: { type: string, enum: [suppliers, jobs, hotels] }
 *               position: { type: integer }
 *               period: { type: string, enum: [fortnight, month], description: 14 days, or 1 month (2 × 14 days) }
 *               vacancy: { type: string, description: jobs block only }
 *     responses:
 *       201: { description: "{ booking, invoice (paymentUrl when Mollie is set up) }" }
 * /ads/{id}:
 *   delete:
 *     summary: Cancel an unpaid booking
 *     tags: [Ads]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Cancelled }
 * /ads/admin:
 *   get:
 *     summary: All bookings (admins)
 *     tags: [Ads]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Bookings }
 */
adsRouter.get("/sponsored", sponsored);
// Phase 2 (Master Briefing v4): booking ads is hidden until an admin switches it on.
adsRouter.get("/availability", requireFeature("advertising"), members, availability);
adsRouter.get("/mine", requireFeature("advertising"), members, myBookings);
adsRouter.post(
  "/",
  requireFeature("advertising"),
  members,
  body("block").isIn(AD_BLOCKS).withMessage("Choose a block"),
  body("position").isInt({ min: 1 }).withMessage("Choose a position"),
  body("period").isIn(AD_PERIODS).withMessage("Choose 14 days or 1 month"),
  body("vacancy").optional({ checkFalsy: true }).isMongoId(),
  validate,
  book
);
adsRouter.delete("/:id", members, idParamRule, validate, cancel);
adsRouter.get("/admin", adminOnly, adminBookings);
