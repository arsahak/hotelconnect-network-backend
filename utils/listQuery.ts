import type { Request } from "express";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

/** ?page=2&limit=12 → skip/limit, capped so one request can't ask for everything. */
export function pagination(req: Request, defaultLimit = 12, maxLimit = 50) {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit)
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function toPage<T>(items: T[], total: number, page: number, limit: number): Page<T> {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}

/** A case-insensitive "contains" match that is safe for any user input. */
export function containsRegex(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/** Reads a string query param, trimmed; undefined when missing or empty. */
export function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
