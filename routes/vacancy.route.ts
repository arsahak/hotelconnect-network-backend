import { Router } from "express";
import {
  adminGetVacancy,
  adminListVacancies,
  applyToVacancy,
  createVacancy,
  deleteVacancy,
  getVacancy,
  listVacancies,
  updateVacancy,
} from "../controllers/vacancy.controller";
import { adminOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { rateLimit } from "../middleware/rateLimit";
import { cvUpload } from "../middleware/upload";
import { env } from "../config/env";
import {
  adminListVacanciesRules,
  applyRules,
  listVacanciesRules,
  vacancyBodyRules,
  vacancyIdRules,
  vacancySlugRules,
} from "../validators/vacancy.validator";

const router = Router();

// Stops the CV form from being used to spam hotels.
const applyLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  message: "Too many applications from this connection. Please try again later.",
  enabled: env.isProduction,
});

/**
 * @swagger
 * tags:
 *   name: Vacancies
 *   description: Public jobs page and applications
 */

/**
 * @swagger
 * /vacancies:
 *   get:
 *     summary: List published jobs (urgent first)
 *     tags: [Vacancies]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string }, description: e.g. Kitchen }
 *       - { in: query, name: region, schema: { type: string } }
 *       - { in: query, name: urgent, schema: { type: boolean }, description: Only urgent jobs (homepage) }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 12, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "{ items: Vacancy[], total, page, pages, limit }"
 */
router.get("/", listVacanciesRules, validate, listVacancies);

// ── Admin (before /:slug) ───────────────────────────────────────────────────

/**
 * @swagger
 * /vacancies/admin:
 *   get:
 *     summary: All jobs, any status (admins)
 *     tags: [Vacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, published, closed] } }
 *       - { in: query, name: hotel, schema: { type: string }, description: Hotel id }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ items, total, page, pages, limit }" }
 *   post:
 *     summary: Add a job (city and region come from the hotel)
 *     tags: [Vacancies]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hotel, title, category, employmentType]
 *             properties:
 *               hotel: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               category: { type: string }
 *               employmentType: { type: string }
 *               urgent: { type: boolean }
 *               status: { type: string, enum: [pending, published, closed] }
 *               applyEmail: { type: string, description: Defaults to the hotel's vacancies email }
 *               applyWhatsapp: { type: string, example: "31612345678" }
 *     responses:
 *       201: { description: Job created }
 */
router.get("/admin", adminOnly, adminListVacanciesRules, validate, adminListVacancies);
router.post("/admin", adminOnly, vacancyBodyRules(true), validate, createVacancy);

/**
 * @swagger
 * /vacancies/admin/{id}:
 *   get:
 *     summary: One job, any status (admins)
 *     tags: [Vacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The job }
 *   patch:
 *     summary: Edit or publish a job (send only the fields that change)
 *     tags: [Vacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Job updated }
 *   delete:
 *     summary: Delete a job
 *     tags: [Vacancies]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Job deleted }
 */
router.get("/admin/:id", adminOnly, vacancyIdRules, validate, adminGetVacancy);
router.patch("/admin/:id", adminOnly, vacancyIdRules, vacancyBodyRules(false), validate, updateVacancy);
router.delete("/admin/:id", adminOnly, vacancyIdRules, validate, deleteVacancy);

/**
 * @swagger
 * /vacancies/{slug}:
 *   get:
 *     summary: Get one published job
 *     tags: [Vacancies]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The job
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Vacancy' }
 *       404:
 *         description: Job not found
 */
router.get("/:slug", vacancySlugRules, validate, getVacancy);

/**
 * @swagger
 * /vacancies/{slug}/apply:
 *   post:
 *     summary: Apply with a CV (emailed to the hotel, never stored)
 *     tags: [Vacancies]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               message: { type: string, maxLength: 2000 }
 *               cv: { type: string, format: binary, description: PDF or Word, max 5MB }
 *     responses:
 *       200:
 *         description: Application sent to the hotel
 *       404:
 *         description: Job not found
 *       422:
 *         description: Validation failed or wrong file type
 */
router.post("/:slug/apply", applyLimiter, cvUpload.single("cv"), applyRules, validate, applyToVacancy);

export default router;
