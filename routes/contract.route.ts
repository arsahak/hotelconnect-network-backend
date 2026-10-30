import { Router } from "express";
import { createContract, deleteContract, getContract, listContracts, updateContract } from "../controllers/contract.controller";
import { hotelOnly } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { contractBodyRules, contractIdRules, listContractsRules } from "../validators/contract.validator";

const router = Router();
const manager = hotelOnly("hotel_manager");

/**
 * @swagger
 * tags:
 *   name: Contracts
 *   description: Contract register of the signed-in hotel (hotel managers)
 */

/**
 * @swagger
 * /contracts:
 *   get:
 *     summary: The hotel's contracts (soonest end date first) and yearly totals
 *     tags: [Contracts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "{ items: Contract[], totals: { count, costPerYear (null until costs are filled in), withCost } }"
 *   post:
 *     summary: Add a contract (all fields optional, but give contractFor or company)
 *     tags: [Contracts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Contract' }
 *     responses:
 *       201: { description: Contract added }
 *       422: { description: Validation failed }
 */
router.get("/", manager, listContractsRules, validate, listContracts);
router.post("/", manager, contractBodyRules, validate, createContract);

/**
 * @swagger
 * /contracts/{id}:
 *   get:
 *     summary: One contract of the hotel
 *     tags: [Contracts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: The contract }
 *       404: { description: Not found (or not this hotel's) }
 *   patch:
 *     summary: Edit a contract
 *     tags: [Contracts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Contract saved }
 *   delete:
 *     summary: Delete a contract
 *     tags: [Contracts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Contract deleted }
 */
router.get("/:id", manager, contractIdRules, validate, getContract);
router.patch("/:id", manager, contractIdRules, contractBodyRules, validate, updateContract);
router.delete("/:id", manager, contractIdRules, validate, deleteContract);

export default router;
