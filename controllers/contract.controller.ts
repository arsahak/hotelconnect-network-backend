import type { Request, Response } from "express";
import { Contract } from "../models/contract.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, queryString } from "../utils/listQuery";
import { pick } from "../utils/pick";

// Contract register of the signed-in hotel (briefing §3.4.1). Every query is
// limited to req.user.hotel, so a hotel only ever sees its own contracts.

const EDITABLE = [
  "contractFor",
  "company",
  "startDate",
  "endDate",
  "duration",
  "autoRenew",
  "noticePeriod",
  "paymentTerm",
  "costPerYear",
  "ledgerAccount",
  "contractLink",
  "portalLink",
  "notes",
] as const;

const mine = (req: Request) => ({ hotel: req.user!.hotel });

/** All contracts, soonest end date first, plus the totals for budgeting. */
export const listContracts = asyncHandler(async (req: Request, res: Response) => {
  const q = queryString(req, "q");
  const filter: Record<string, unknown> = mine(req);
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ contractFor: match }, { company: match }, { ledgerAccount: match }];
  }

  const contracts = await Contract.find(filter).sort({ endDate: 1, createdAt: -1 });
  const withCost = contracts.filter((c) => typeof c.costPerYear === "number");
  // Briefing: the total only shows once costs are filled in.
  const totals = {
    count: contracts.length,
    costPerYear: withCost.length ? withCost.reduce((sum, c) => sum + (c.costPerYear ?? 0), 0) : null,
    withCost: withCost.length,
  };

  return ApiResponse(res, 200, "Contracts fetched successfully", { items: contracts, totals });
});

export const getContract = asyncHandler(async (req: Request, res: Response) => {
  const contract = await Contract.findOne({ _id: req.params.id, ...mine(req) });
  if (!contract) throw new ApiError(404, "Contract not found");
  return ApiResponse(res, 200, "Contract fetched successfully", contract);
});

export const createContract = asyncHandler(async (req: Request, res: Response) => {
  const contract = await Contract.create({ ...pick(req.body, EDITABLE), ...mine(req) });
  return ApiResponse(res, 201, "Contract added successfully", contract);
});

export const updateContract = asyncHandler(async (req: Request, res: Response) => {
  const contract = await Contract.findOne({ _id: req.params.id, ...mine(req) });
  if (!contract) throw new ApiError(404, "Contract not found");
  contract.set(pick(req.body, EDITABLE));
  await contract.save();
  return ApiResponse(res, 200, "Contract saved successfully", contract);
});

export const deleteContract = asyncHandler(async (req: Request, res: Response) => {
  const contract = await Contract.findOneAndDelete({ _id: req.params.id, ...mine(req) });
  if (!contract) throw new ApiError(404, "Contract not found");
  return ApiResponse(res, 200, "Contract deleted successfully");
});
