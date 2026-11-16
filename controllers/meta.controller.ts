import type { Request, Response } from "express";
import {
  ARTICLE_KINDS,
  COUNTRIES,
  EMPLOYMENT_TYPES,
  FAULT_TYPES,
  NOTICE_UNITS,
  PORTAL_CATEGORIES,
  REGIONS,
  SUPPLIER_CATEGORIES,
  SUPPLIER_REGIONS,
  TENDER_TYPES,
  VACANCY_CATEGORIES,
  SUPPLIER_VACANCY_GROUPS,
  VOUCHER_CATEGORIES,
} from "../config/constants";
import { ApiResponse } from "../utils/ApiResponse";

/** The fixed lists behind every filter, so the website and API never disagree. */
export const getOptions = (_req: Request, res: Response) =>
  ApiResponse(res, 200, "Options fetched successfully", {
    regions: REGIONS,
    countries: COUNTRIES,
    supplierRegions: SUPPLIER_REGIONS,
    vacancyCategories: VACANCY_CATEGORIES,
    supplierVacancyGroups: SUPPLIER_VACANCY_GROUPS,
    employmentTypes: EMPLOYMENT_TYPES,
    supplierCategories: SUPPLIER_CATEGORIES,
    voucherCategories: VOUCHER_CATEGORIES,
    articleKinds: ARTICLE_KINDS,
    faultTypes: FAULT_TYPES,
    noticeUnits: NOTICE_UNITS,
    portalCategories: PORTAL_CATEGORIES,
    tenderTypes: TENDER_TYPES,
  });
