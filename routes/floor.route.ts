import { Router } from "express";
import {
  addEntry,
  addItem,
  addLog,
  addRequest,
  addWaste,
  createIssue,
  createSpaces,
  deleteIssue,
  deleteItem,
  deleteLog,
  deleteProduct,
  deleteSpace,
  deleteWaste,
  exportList,
  fixIssue,
  getChecklist,
  getToday,
  listIssues,
  listProducts,
  listRequests,
  listSpaces,
  listWaste,
  saveProduct,
  updateItem,
  updateRequest,
  updateSpace,
} from "../controllers/floor.controller";
import { hotelOnly } from "../middleware/auth";
import { issuePhotoUpload, upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParamRule } from "../validators/common.validator";
import {
  entryRules,
  issueRules,
  itemRules,
  listParamRule,
  logRules,
  productRules,
  rangeRules,
  requestRules,
  requestStatusRules,
  spaceRules,
  wasteRules,
} from "../validators/floor.validator";

const router = Router();
// The GM and every staff account of the hotel; managers-only parts are checked in the controller.
router.use(hotelOnly("hotel_manager", "hotel_staff"));

/**
 * @swagger
 * tags:
 *   name: Floor
 *   description: >
 *     The floor app (Master Briefing v4): today (handover, schedule, alerts), rooms & spaces / inventory,
 *     issues (out of order, photo max 150KB), checklists (Legionella, HACCP, MOD round, preventive
 *     maintenance), waste list, visual procurement, CSV exports. GM + all hotel staff.
 */

/**
 * @swagger
 * /floor/today:
 *   get:
 *     summary: Handover notes (24h), today's appointments + due maintenance, open issues, Legionella flushes; managers also missed-yesterday and the order queue
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Today }
 */
router.get("/today", getToday);

/**
 * @swagger
 * /floor/log:
 *   post:
 *     summary: Add a shift handover note or an appointment (time HH:MM)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Saved }
 * /floor/log/{id}:
 *   delete:
 *     summary: Delete a note (your own, or any as manager)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted }
 */
router.post("/log", logRules, validate, addLog);
router.delete("/log/:id", [idParamRule], validate, deleteLog);

/**
 * @swagger
 * /floor/spaces:
 *   get:
 *     summary: Rooms & spaces with inventory specs, water points, vacancy and out-of-order state
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Spaces }
 *   post:
 *     summary: Add a room/space, or a range of room numbers ("101-120") (managers)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Added }
 * /floor/spaces/{id}:
 *   patch:
 *     summary: Edit (managers); staff may only set vacantSince
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Saved }
 *   delete:
 *     summary: Delete (managers)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted }
 */
router.get("/spaces", listSpaces);
router.post("/spaces", spaceRules(true), validate, createSpaces);
router.patch("/spaces/:id", spaceRules(false), validate, updateSpace);
router.delete("/spaces/:id", [idParamRule], validate, deleteSpace);

/**
 * @swagger
 * /floor/issues:
 *   get:
 *     summary: Issues & tasks (?status=open|fixed, ?department=HSK|TD|FO|FB)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Issues }
 *   post:
 *     summary: Report an issue (multipart; photo max 150KB); outOfOrder blocks the room
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Reported }
 * /floor/issues/{id}/fix:
 *   post:
 *     summary: Mark fixed & release the room
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Fixed }
 */
router.get("/issues", listIssues);
router.post("/issues", issuePhotoUpload.single("photo"), issueRules, validate, createIssue);
router.post("/issues/:id/fix", [idParamRule], validate, fixIssue);
router.delete("/issues/:id", [idParamRule], validate, deleteIssue);

/**
 * @swagger
 * /floor/checklists/{list}:
 *   get:
 *     summary: A checklist (legionella | haccp | mod | preventive) for a day (?date, ?shift for MOD) with its entries
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: list, required: true, schema: { type: string, enum: [legionella, haccp, mod, preventive] } }
 *     responses:
 *       200: { description: Items and entries }
 * /floor/checklists/{list}/entries:
 *   post:
 *     summary: Tick an item / log °C / flush a water point (cold + warm °C); out-of-limit values are flagged
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: list, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: Saved }
 * /floor/checklists/{list}/items:
 *   post:
 *     summary: Add a custom item (managers)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: list, required: true, schema: { type: string } }
 *     responses:
 *       201: { description: Added }
 */
router.get("/checklists/:list", [listParamRule], validate, getChecklist);
router.post("/checklists/:list/entries", entryRules, validate, addEntry);
router.post("/checklists/:list/items", itemRules(true), validate, addItem);
router.patch("/checklist-items/:id", itemRules(false), validate, updateItem);
router.delete("/checklist-items/:id", [idParamRule], validate, deleteItem);

/**
 * @swagger
 * /floor/waste:
 *   get:
 *     summary: Waste list (?from, ?to)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Entries }
 *   post:
 *     summary: Add waste (product, quantity/weight, reason)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Saved }
 */
router.get("/waste", rangeRules, validate, listWaste);
router.post("/waste", wasteRules, validate, addWaste);
router.delete("/waste/:id", [idParamRule], validate, deleteWaste);

/**
 * @swagger
 * /floor/products:
 *   get:
 *     summary: Visual procurement list (photos, supplier call/email)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Products }
 * /floor/requests:
 *   get:
 *     summary: Open product requests (the order queue)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Requests }
 *   post:
 *     summary: Ask for a product (tap its photo)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Requested }
 */
router.get("/products", listProducts);
router.post("/products", upload.single("photo"), productRules, validate, saveProduct);
router.patch("/products/:id", upload.single("photo"), [idParamRule, ...productRules], validate, saveProduct);
router.delete("/products/:id", [idParamRule], validate, deleteProduct);
router.get("/requests", listRequests);
router.post("/requests", requestRules, validate, addRequest);
router.patch("/requests/:id", requestStatusRules, validate, updateRequest);

/**
 * @swagger
 * /floor/export/{list}:
 *   get:
 *     summary: CSV export (opens in Excel) of legionella, haccp, mod, preventive or waste (?from, ?to)
 *     tags: [Floor]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: list, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: CSV file }
 */
router.get("/export/:list", rangeRules, validate, exportList);

export default router;
