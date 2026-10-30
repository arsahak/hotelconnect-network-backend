import { body, type ValidationChain } from "express-validator";
import { NOTICE_UNITS } from "../config/constants";
import { idParamRule, listQueryRules, optionalDate, optionalNumber, optionalUrl } from "./common.validator";

const text = (field: string, max: number, label: string) =>
  body(field).optional().isString().trim().isLength({ max }).withMessage(`${label} can be at most ${max} characters`);

/** Briefing §3.4.1: every field is optional (but say what the contract is). */
export const contractBodyRules: ValidationChain[] = [
  text("contractFor", 120, "Contract for"),
  text("company", 120, "Company"),
  optionalDate("startDate", "Start date"),
  optionalDate("endDate", "End date"),
  text("duration", 60, "Duration"),
  body("autoRenew").optional().isBoolean().toBoolean(),
  optionalNumber("noticePeriod.value", "Notice period", { max: 1000 }),
  body("noticePeriod.unit").optional().isIn(NOTICE_UNITS).withMessage("Notice period unit must be days, weeks or months"),
  text("paymentTerm", 60, "Payment term"),
  optionalNumber("costPerYear", "Cost per year", { max: 100_000_000 }),
  text("ledgerAccount", 30, "Ledger account"),
  optionalUrl("contractLink", "Link to contract"),
  optionalUrl("portalLink", "Portal link"),
  text("notes", 2000, "Notes"),
];

export const contractIdRules: ValidationChain[] = [idParamRule];
export const listContractsRules: ValidationChain[] = [...listQueryRules];
