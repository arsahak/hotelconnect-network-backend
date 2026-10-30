import { body, param, type ValidationChain } from "express-validator";
import { PURCHASE_STATUSES } from "../models/purchaseAction.model";
import { idParamRule } from "./common.validator";

/** Briefing §3.13: current supplier, contract end date, annual usage (optional) + PDF. Sent as multipart. */
export const joinRules: ValidationChain[] = [
  idParamRule,
  body("currentSupplier").trim().isLength({ min: 2, max: 120 }).withMessage("Fill in your current supplier"),
  body("contractEndDate").custom((v) => !Number.isNaN(Date.parse(v))).withMessage("Fill in the end date of your contract"),
  body("annualUsage").optional().isString().trim().isLength({ max: 200 }),
];

/** Admin: create (all required) or edit an action. */
export const purchaseActionRules = (create: boolean): ValidationChain[] => {
  const required = (field: string) => (create ? body(field) : body(field).optional());
  return [
    required("title").trim().isLength({ min: 3, max: 120 }).withMessage("Fill in a title"),
    body("category").optional().isString().trim().isLength({ max: 60 }),
    body("description").optional().isString().trim().isLength({ max: 3000 }),
    required("deadline").custom((v) => !Number.isNaN(Date.parse(v))).withMessage("Fill in a deadline"),
    body("expectedSavings").optional().isString().trim().isLength({ max: 120 }),
    body("targetParticipants").optional().isInt({ min: 1, max: 1000 }).withMessage("Participants needed: a whole number").toInt(),
    body("status").optional().isIn(PURCHASE_STATUSES).withMessage("Status must be open, negotiating or completed"),
  ];
};

export const participationFileRules: ValidationChain[] = [idParamRule, param("pid").isMongoId().withMessage("Invalid participant")];
