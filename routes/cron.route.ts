import { Router } from "express";
import { runDaily } from "../controllers/cron.controller";

const router = Router();

/**
 * @swagger
 * /cron/daily:
 *   get:
 *     summary: Runs the scheduled jobs (contract/permit reminders, deleting old purchasing invoices)
 *     description: Called once a day by Vercel Cron (see vercel.json) with "Authorization Bearer CRON_SECRET".
 *     tags: [System]
 *     responses:
 *       200: { description: "{ reminders, invoices }" }
 *       401: { description: Wrong or missing secret }
 *       503: { description: CRON_SECRET not set }
 */
router.get("/daily", runDaily);

export default router;
