import { Router } from "express";
import {
  adminGetArticle,
  adminListArticles,
  createArticle,
  deleteArticle,
  deleteArticleImage,
  getArticle,
  listArticles,
  updateArticle,
  uploadArticleImage,
} from "../controllers/article.controller";
import { adminOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import {
  adminListArticlesRules,
  articleBodyRules,
  articleIdRules,
  articleSlugRules,
  listArticlesRules,
} from "../validators/article.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Articles
 *   description: Stories — articles, interviews and columns
 */

/**
 * @swagger
 * /articles:
 *   get:
 *     summary: List published stories (newest first)
 *     tags: [Articles]
 *     parameters:
 *       - { in: query, name: kind, schema: { type: string, enum: [Article, Interview, Column] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 9, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "{ items: Article[] (without body), total, page, pages, limit }"
 */
router.get("/", listArticlesRules, validate, listArticles);

// ── Admin (before /:slug) ───────────────────────────────────────────────────

/**
 * @swagger
 * /articles/admin:
 *   get:
 *     summary: All stories, drafts included (admins)
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: kind, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [draft, published] } }
 *     responses:
 *       200: { description: "{ items, total, page, pages, limit }" }
 *   post:
 *     summary: Add a story (HTML is cleaned; reading time is worked out)
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               kind: { type: string, enum: [Article, Interview, Column] }
 *               excerpt: { type: string }
 *               body: { type: string, description: HTML }
 *               status: { type: string, enum: [draft, published] }
 *               publishedAt: { type: string, format: date-time }
 *     responses:
 *       201: { description: Story created }
 */
router.get("/admin", adminOnly, adminListArticlesRules, validate, adminListArticles);
router.post("/admin", adminOnly, articleBodyRules(true), validate, createArticle);

/**
 * @swagger
 * /articles/admin/{id}:
 *   get:
 *     summary: One story with its body (admins)
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The story }
 *   patch:
 *     summary: Edit or publish a story
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Story updated }
 *   delete:
 *     summary: Delete a story
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Story deleted }
 */
router.get("/admin/:id", adminOnly, articleIdRules, validate, adminGetArticle);
router.patch("/admin/:id", adminOnly, articleIdRules, articleBodyRules(false), validate, updateArticle);
router.delete("/admin/:id", adminOnly, articleIdRules, validate, deleteArticle);

/**
 * @swagger
 * /articles/admin/{id}/image:
 *   put:
 *     summary: Upload or replace the cover photo
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
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
 *     summary: Remove the cover photo
 *     tags: [Articles]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Photo removed }
 */
router.put("/admin/:id/image", adminOnly, articleIdRules, validate, upload.single("image"), uploadArticleImage);
router.delete("/admin/:id/image", adminOnly, articleIdRules, validate, deleteArticleImage);

/**
 * @swagger
 * /articles/{slug}:
 *   get:
 *     summary: Get one published story, with its body
 *     tags: [Articles]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The story
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Article' }
 *       404:
 *         description: Story not found
 */
router.get("/:slug", articleSlugRules, validate, getArticle);

export default router;
