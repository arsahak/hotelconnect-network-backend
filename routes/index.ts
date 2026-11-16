import { Router } from "express";
import authRoutes from "./auth.route";
import userRoutes from "./user.route";
import uploadRoutes from "./upload.route";
import hotelRoutes from "./hotel.route";
import supplierRoutes from "./supplier.route";
import vacancyRoutes from "./vacancy.route";
import voucherRoutes from "./voucher.route";
import articleRoutes from "./article.route";
import waitlistRoutes from "./waitlist.route";
import myHotelRoutes from "./myHotel.route";
import contractRoutes from "./contract.route";
import permitRoutes from "./permit.route";
import mySupplierRoutes from "./mySupplier.route";
import myVacancyRoutes from "./myVacancy.route";
import myVoucherRoutes from "./myVoucher.route";
import notificationRoutes from "./notification.route";
import portalLinkRoutes from "./portalLink.route";
import cronRoutes from "./cron.route";
import { adsRouter, billingRouter, paymentsRouter } from "./billing.route";
import purchaseRoutes from "./purchase.route";
import pushRoutes from "./push.route";
import { registrationRouter, settingsRouter } from "./registration.route";
import supplierTenderRoutes from "./supplierTender.route";
import tenderRoutes from "./tender.route";
import publicTenderRoutes from "./publicTender.route";
import floorRoutes from "./floor.route";
import faultContactRoutes from "./faultContact.route";
import { getOptions } from "../controllers/meta.controller";

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "API is healthy" });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/uploads", uploadRoutes);

// Public website
router.use("/hotels", hotelRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/vacancies", vacancyRoutes);
router.use("/vouchers", voucherRoutes);
router.use("/articles", articleRoutes);
router.use("/waitlist", waitlistRoutes);

// Hotel dashboard (hotel managers and the staff login)
router.use("/my-hotel", myHotelRoutes);
router.use("/contracts", contractRoutes);
router.use("/permits", permitRoutes);
router.use("/portal-links", portalLinkRoutes);
router.use("/tenders", tenderRoutes);
router.use("/public-tenders", publicTenderRoutes);
router.use("/floor", floorRoutes);
router.use("/supplier-tenders", supplierTenderRoutes);
router.use("/my-supplier", mySupplierRoutes);
router.use("/my-vacancies", myVacancyRoutes);
router.use("/my-vouchers", myVoucherRoutes);
router.use("/notifications", notificationRoutes);
router.use("/purchasing", purchaseRoutes);
router.use("/push", pushRoutes);
router.use("/cron", cronRoutes);
router.use("/billing", billingRouter);
router.use("/payments", paymentsRouter);
router.use("/ads", adsRouter);
router.use("/settings", settingsRouter);
router.use("/registrations", registrationRouter);
router.use("/fault-contacts", faultContactRoutes);

/**
 * @swagger
 * /meta/options:
 *   get:
 *     summary: Fixed lists for filters and forms (regions, categories, …)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: "{ regions, supplierRegions, vacancyCategories, employmentTypes, supplierCategories, voucherCategories, articleKinds }"
 */
router.get("/meta/options", getOptions);

export default router;
