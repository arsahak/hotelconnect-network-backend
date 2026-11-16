import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  ChecklistEntry,
  ChecklistItem,
  CHECKLISTS,
  Issue,
  LogEntry,
  Product,
  ProductRequest,
  Space,
  Waste,
  type ChecklistKind,
} from "../models/floor.model";
import { Hotel } from "../models/hotel.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { addDays, dayOf, ensureDefaults, LEGIONELLA } from "../utils/floorDefaults";
import { pick } from "../utils/pick";
import { deleteFromSpaces, uploadToSpaces } from "../utils/uploadToSpaces";

// The floor app API (Master Briefing v4, part 3). Hotel managers (GM) and all
// staff of the hotel; some parts are for managers only (GM + department managers).

const hotelOf = (req: Request) => req.user!.hotel!;
const nameOf = (req: Request) => [req.user!.firstName, req.user!.lastName].filter(Boolean).join(" ");
/** GM or department manager: sees "missed yesterday", the order queue, edits lists. */
export const isFloorManager = (req: Request) => req.user!.role === "hotel_manager" || req.user!.hotelRole === "dept_manager";
const requireManager = (req: Request) => {
  if (!isFloorManager(req)) throw new ApiError(403, "Only managers can do this");
};
const listParam = (req: Request) => {
  const list = req.params.list as ChecklistKind;
  if (!CHECKLISTS.includes(list)) throw new ApiError(404, "Unknown checklist");
  return list;
};

// ── Today: shift handover, schedule, alerts ──

/** Items of started MOD rounds that were not ticked off, per shift (yesterday). */
async function missedYesterday(hotel: unknown) {
  const yesterday = addDays(dayOf(), -1);
  const [items, entries] = await Promise.all([
    ChecklistItem.find({ hotel, list: "mod", active: true }).select("_id").lean(),
    ChecklistEntry.find({ hotel, list: "mod", date: yesterday }).select("item shift done").lean(),
  ]);
  const shifts = [...new Set(entries.map((e) => e.shift))];
  return shifts
    .map((shift) => {
      const done = new Set(entries.filter((e) => e.shift === shift && e.done).map((e) => String(e.item)));
      return { shift, missed: items.filter((i) => !done.has(String(i._id))).length };
    })
    .filter((s) => s.missed > 0);
}

/** Legionella: water points (and rooms empty > 6 days) and how many were flushed today / in 7 days. */
async function flushPoints(hotel: unknown) {
  const today = dayOf();
  const points = await Space.find({
    hotel,
    $or: [{ waterPoint: true }, { kind: "room", vacantSince: { $ne: null, $lte: addDays(today, -LEGIONELLA.vacantDays) } }],
  })
    .select("name floor waterPoint vacantSince")
    .sort({ name: 1 })
    .lean();
  const recent = await ChecklistEntry.find({ hotel, list: "legionella", date: { $gte: addDays(today, -LEGIONELLA.flushEveryDays + 1) } })
    .select("space date value value2 ok signerName")
    .sort({ date: -1 })
    .lean();
  const last = new Map<string, (typeof recent)[number]>();
  for (const e of recent) if (e.space && !last.has(String(e.space))) last.set(String(e.space), e);
  return points.map((p) => {
    const entry = last.get(String(p._id)) ?? null;
    return { space: p, last: entry, flushedToday: Boolean(entry && dayOf(entry.date).getTime() === today.getTime()), overdue: !entry };
  });
}

/** GET /floor/today — the floor app's start screen (and the Manager Cockpit). */
export const getToday = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  const today = dayOf();
  await ensureDefaults(hotel, "preventive");
  const manager = isFloorManager(req);
  const [handovers, appointments, dueTasks, openIssues, flush, missed, orderQueue] = await Promise.all([
    LogEntry.find({ hotel, kind: "handover", createdAt: { $gte: addDays(new Date(), -1) } }).sort({ createdAt: -1 }).limit(20).lean(),
    LogEntry.find({ hotel, kind: "appointment", date: today }).sort({ time: 1 }).lean(),
    ChecklistItem.find({ hotel, list: "preventive", active: true, nextDue: { $lte: today } }).sort({ nextDue: 1 }).lean(),
    Issue.countDocuments({ hotel, status: "open" }),
    flushPoints(hotel),
    manager ? missedYesterday(hotel) : Promise.resolve([]),
    manager ? ProductRequest.countDocuments({ hotel, status: "requested" }) : Promise.resolve(null),
  ]);
  const hotelDoc = await Hotel.findById(hotel).select("name").lean();
  return ApiResponse(res, 200, "Today", {
    date: today,
    hotel: hotelDoc?.name ?? "",
    me: { name: nameOf(req), hotelRole: req.user!.hotelRole ?? (req.user!.role === "hotel_manager" ? "gm" : "staff"), department: req.user!.department ?? "" },
    manager,
    handovers,
    appointments,
    dueTasks,
    openIssues,
    flush: { done: flush.filter((f) => f.flushedToday).length, total: flush.length, overdue: flush.filter((f) => f.overdue).length },
    missedYesterday: missed,
    orderQueue,
  });
});

/** POST /floor/log — a handover note or an appointment. */
export const addLog = asyncHandler(async (req: Request, res: Response) => {
  const entry = await LogEntry.create({
    hotel: hotelOf(req),
    kind: req.body.kind,
    date: dayOf(req.body.date ?? new Date()),
    time: req.body.time ?? "",
    text: req.body.text,
    department: req.body.department ?? "",
    createdBy: req.user!._id,
    authorName: nameOf(req),
  });
  return ApiResponse(res, 201, "Saved", entry);
});

export const deleteLog = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { _id: req.params.id, hotel: hotelOf(req) };
  if (!isFloorManager(req)) filter.createdBy = req.user!._id;
  const r = await LogEntry.deleteOne(filter);
  if (!r.deletedCount) throw new ApiError(404, "Not found");
  return ApiResponse(res, 200, "Deleted");
});

// ── Rooms & spaces / inventory ──

export const listSpaces = asyncHandler(async (req: Request, res: Response) => {
  const spaces = await Space.find({ hotel: hotelOf(req) }).sort({ kind: 1, name: 1 }).lean();
  return ApiResponse(res, 200, "Spaces fetched", spaces);
});

const SPACE_FIELDS = ["name", "kind", "floor", "waterPoint", "vacantSince", "specs"] as const;

export const createSpaces = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  const hotel = hotelOf(req);
  // One name, or a range of room numbers ("101-120") in one go.
  const names: string[] = req.body.range
    ? (() => {
        const [from, to] = String(req.body.range).split("-").map((n) => Number(n.trim()));
        if (!from || !to || to < from || to - from > 300) throw new ApiError(422, "Use a range like 101-120");
        return Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
      })()
    : [req.body.name];
  const existing = new Set((await Space.find({ hotel, name: { $in: names } }).select("name").lean()).map((s) => s.name));
  const fresh = names.filter((n) => !existing.has(n));
  const created = await Space.insertMany(fresh.map((name) => ({ ...pick(req.body, SPACE_FIELDS), name, hotel })));
  return ApiResponse(res, 201, `${created.length} added`, created);
});

export const updateSpace = asyncHandler(async (req: Request, res: Response) => {
  const space = await Space.findOne({ _id: req.params.id, hotel: hotelOf(req) });
  if (!space) throw new ApiError(404, "Not found");
  // Staff may only mark a room empty / occupied; managers edit everything.
  space.set(isFloorManager(req) ? pick(req.body, SPACE_FIELDS) : pick(req.body, ["vacantSince"] as const));
  await space.save();
  return ApiResponse(res, 200, "Saved", space);
});

export const deleteSpace = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  await Space.deleteOne({ _id: req.params.id, hotel: hotelOf(req) });
  return ApiResponse(res, 200, "Deleted");
});

// ── Issues ──

export const listIssues = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { hotel: hotelOf(req) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.department) filter.department = req.query.department;
  const issues = await Issue.find(filter).populate("space", "name").sort({ status: 1, outOfOrder: -1, createdAt: -1 }).limit(200).lean();
  return ApiResponse(res, 200, "Issues fetched", issues);
});

/** POST /floor/issues (multipart: photo max 150KB). Out of order blocks the room. */
export const createIssue = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  const space = req.body.space ? await Space.findOne({ _id: req.body.space, hotel }) : null;
  const outOfOrder = req.body.outOfOrder === true || req.body.outOfOrder === "true";
  const photo = req.file ? await uploadToSpaces(req.file, "issues") : null;
  const issue = await Issue.create({
    hotel,
    space: space?._id ?? null,
    location: req.body.location ?? "",
    department: req.body.department ?? "",
    title: req.body.title,
    outOfOrder: Boolean(space && outOfOrder),
    photo: photo?.url ?? "",
    photoKey: photo?.key ?? "",
    reportedBy: req.user!._id,
    reporterName: nameOf(req),
  });
  if (space && outOfOrder) await Space.updateOne({ _id: space._id }, { outOfOrder: true });
  return ApiResponse(res, 201, "Issue reported", issue);
});

/** POST /floor/issues/:id/fix — "Mark fixed & release room". */
export const fixIssue = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  const issue = await Issue.findOne({ _id: req.params.id, hotel }).select("+photoKey");
  if (!issue) throw new ApiError(404, "Issue not found");
  issue.set({ status: "fixed", fixedBy: req.user!._id, fixedAt: new Date() });
  await issue.save();
  // Release the room when no other out-of-order issue keeps it blocked.
  if (issue.space && !(await Issue.exists({ hotel, space: issue.space, status: "open", outOfOrder: true }))) {
    await Space.updateOne({ _id: issue.space }, { outOfOrder: false });
  }
  return ApiResponse(res, 200, "Fixed", issue);
});

export const deleteIssue = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  const issue = await Issue.findOne({ _id: req.params.id, hotel: hotelOf(req) }).select("+photoKey");
  if (!issue) throw new ApiError(404, "Issue not found");
  await deleteFromSpaces(issue.photoKey);
  await issue.deleteOne();
  return ApiResponse(res, 200, "Deleted");
});

// ── Checklists ──

/** GET /floor/checklists/:list?date=&shift= — items with the day's entries. */
export const getChecklist = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  const list = listParam(req);
  const date = dayOf(String(req.query.date ?? new Date().toISOString()));
  if (list === "legionella") {
    const [points, entries] = await Promise.all([
      flushPoints(hotel),
      ChecklistEntry.find({ hotel, list, date }).sort({ createdAt: -1 }).lean(),
    ]);
    return ApiResponse(res, 200, "Checklist", { list, date, limits: LEGIONELLA, points, entries });
  }
  await ensureDefaults(hotel, list);
  const filter: Record<string, unknown> = { hotel, list, date };
  if (list === "mod" && req.query.shift) filter.shift = req.query.shift;
  const [items, entries] = await Promise.all([
    ChecklistItem.find({ hotel, list, active: true }).sort({ section: 1, order: 1 }).lean(),
    ChecklistEntry.find(filter).sort({ createdAt: -1 }).lean(),
  ]);
  return ApiResponse(res, 200, "Checklist", { list, date, items, entries });
});

/** POST /floor/checklists/:list/entries — tick an item / log a temperature / flush a water point. */
export const addEntry = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  const list = listParam(req);
  const date = dayOf(req.body.date ?? new Date());
  const value = req.body.value === "" || req.body.value == null ? null : Number(req.body.value);
  const value2 = req.body.value2 === "" || req.body.value2 == null ? null : Number(req.body.value2);
  let ok = true;
  let item = null;
  let space = null;

  if (list === "legionella") {
    space = await Space.findOne({ _id: req.body.space, hotel });
    if (!space) throw new ApiError(404, "Water point not found");
    if (value == null || value2 == null) throw new ApiError(422, "Fill in the cold and the warm temperature");
    ok = value <= LEGIONELLA.coldMax && value2 >= LEGIONELLA.warmMin;
  } else {
    item = await ChecklistItem.findOne({ _id: req.body.item, hotel, list });
    if (!item) throw new ApiError(404, "Checklist item not found");
    if (item.kind === "temp") {
      if (value == null) throw new ApiError(422, "Fill in the temperature");
      ok = (item.maxC == null || value <= item.maxC) && (item.minC == null || value >= item.minC);
    }
  }

  // One entry per item (or water point) per day and shift: a new tick replaces it.
  const key = { hotel, list, date, shift: req.body.shift ?? "", ...(space ? { space: space._id } : { item: item!._id }) };
  const entry = await ChecklistEntry.findOneAndUpdate(
    key,
    { ...key, value, value2, ok, done: req.body.done !== false, note: req.body.note ?? "", signedBy: req.user!._id, signerName: nameOf(req) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Preventive maintenance: done → next due date moves on.
  if (item && list === "preventive" && req.body.done !== false && item.intervalDays) {
    item.lastDone = date;
    item.nextDue = addDays(date, item.intervalDays);
    await item.save();
  }
  // A flushed vacant room counts again from today.
  if (space && space.vacantSince) await Space.updateOne({ _id: space._id }, { vacantSince: date });
  return ApiResponse(res, 201, ok ? "Saved" : "Saved — outside the limits!", entry);
});

const ITEM_FIELDS = ["section", "label", "kind", "department", "maxC", "minC", "intervalDays", "external", "nextDue", "order", "active"] as const;

/** POST /floor/checklists/:list/items — add a custom item (managers). */
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  const list = listParam(req);
  if (list === "legionella") throw new ApiError(422, "Water points are rooms & spaces");
  const data = pick(req.body, ITEM_FIELDS);
  const item = await ChecklistItem.create({ ...data, hotel: hotelOf(req), list, nextDue: data.intervalDays ? (data.nextDue ?? dayOf()) : null });
  return ApiResponse(res, 201, "Item added", item);
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  const item = await ChecklistItem.findOne({ _id: req.params.id, hotel: hotelOf(req) });
  if (!item) throw new ApiError(404, "Item not found");
  item.set(pick(req.body, ITEM_FIELDS));
  await item.save();
  return ApiResponse(res, 200, "Saved", item);
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  // Keep the history: the item is switched off, not removed.
  await ChecklistItem.updateOne({ _id: req.params.id, hotel: hotelOf(req) }, { active: false });
  return ApiResponse(res, 200, "Removed");
});

// ── Waste list ──

export const listWaste = asyncHandler(async (req: Request, res: Response) => {
  const from = dayOf(String(req.query.from ?? addDays(new Date(), -30).toISOString()));
  const to = dayOf(String(req.query.to ?? new Date().toISOString()));
  const items = await Waste.find({ hotel: hotelOf(req), date: { $gte: from, $lte: to } }).sort({ date: -1, createdAt: -1 }).lean();
  return ApiResponse(res, 200, "Waste fetched", items);
});

export const addWaste = asyncHandler(async (req: Request, res: Response) => {
  const item = await Waste.create({
    ...pick(req.body, ["product", "quantity", "reason"] as const),
    hotel: hotelOf(req),
    date: dayOf(req.body.date ?? new Date()),
    createdBy: req.user!._id,
    authorName: nameOf(req),
  });
  return ApiResponse(res, 201, "Saved", item);
});

export const deleteWaste = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  await Waste.deleteOne({ _id: req.params.id, hotel: hotelOf(req) });
  return ApiResponse(res, 200, "Deleted");
});

// ── Procurement ──

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const products = await Product.find({ hotel: hotelOf(req), active: true }).sort({ department: 1, name: 1 }).lean();
  return ApiResponse(res, 200, "Products fetched", products);
});

const PRODUCT_FIELDS = ["name", "department", "supplierName", "supplierPhone", "supplierEmail"] as const;

export const saveProduct = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  const hotel = hotelOf(req);
  const product = req.params.id ? await Product.findOne({ _id: req.params.id, hotel }).select("+photoKey") : new Product({ hotel });
  if (!product) throw new ApiError(404, "Product not found");
  product.set(pick(req.body, PRODUCT_FIELDS));
  if (req.file) {
    const old = product.photoKey;
    const up = await uploadToSpaces(req.file, "products");
    product.set({ photo: up.url, photoKey: up.key });
    await deleteFromSpaces(old);
  }
  await product.save();
  return ApiResponse(res, req.params.id ? 200 : 201, "Saved", product);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  await Product.updateOne({ _id: req.params.id, hotel: hotelOf(req) }, { active: false });
  return ApiResponse(res, 200, "Removed");
});

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { hotel: hotelOf(req) };
  filter.status = req.query.status ?? { $in: ["requested", "ordered"] };
  const items = await ProductRequest.find(filter).populate("product", "name photo department supplierName supplierPhone supplierEmail").sort({ createdAt: -1 }).limit(200).lean();
  return ApiResponse(res, 200, "Requests fetched", items);
});

/** POST /floor/requests — staff tap a product photo to ask for it. */
export const addRequest = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  if (!(await Product.exists({ _id: req.body.product, hotel, active: true }))) throw new ApiError(404, "Product not found");
  const request = await ProductRequest.create({
    hotel,
    product: req.body.product,
    quantity: req.body.quantity ?? 1,
    note: req.body.note ?? "",
    requestedBy: req.user!._id,
    requesterName: nameOf(req),
  });
  return ApiResponse(res, 201, "Requested", request);
});

/** PATCH /floor/requests/:id — managers mark ordered / received. */
export const updateRequest = asyncHandler(async (req: Request, res: Response) => {
  requireManager(req);
  const request = await ProductRequest.findOne({ _id: req.params.id, hotel: hotelOf(req) });
  if (!request) throw new ApiError(404, "Request not found");
  request.status = req.body.status;
  if (req.body.status === "ordered") request.orderedAt = new Date();
  await request.save();
  return ApiResponse(res, 200, "Saved", request);
});

// ── Exports (CSV opens in Excel; the dashboard prints PDFs) ──

const csv = (rows: (string | number | null | undefined)[][]) =>
  "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
const ymd = (d: Date) => new Date(d).toISOString().slice(0, 10);

/** GET /floor/export/:list?from=&to= — legionella, haccp, mod, preventive, waste or issues (cockpit) as CSV. */
export const exportList = asyncHandler(async (req: Request, res: Response) => {
  const hotel = hotelOf(req);
  const list = req.params.list;
  const from = dayOf(String(req.query.from ?? addDays(new Date(), -30).toISOString()));
  const to = dayOf(String(req.query.to ?? new Date().toISOString()));
  let rows: (string | number | null)[][];

  if (list === "issues") {
    // Live operations for the Manager Cockpit: open issues, plus those fixed in the period.
    const items = await Issue.find({ hotel, $or: [{ status: "open" }, { fixedAt: { $gte: from } }] }).populate<{ space: { name: string } | null }>("space", "name").sort({ status: 1, createdAt: -1 }).lean();
    rows = [["Reported", "Room / place", "Department", "Issue", "Out of order", "Status", "Reported by", "Fixed"], ...items.map((i) => [ymd(i.createdAt), i.space?.name ?? i.location, i.department, i.title, i.outOfOrder ? "yes" : "", i.status, i.reporterName, i.fixedAt ? ymd(i.fixedAt) : ""])];
  } else if (list === "waste") {
    const items = await Waste.find({ hotel, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
    rows = [["Date", "Product", "Quantity / weight", "Reason", "By"], ...items.map((w) => [ymd(w.date), w.product, w.quantity, w.reason, w.authorName])];
  } else if ((CHECKLISTS as readonly string[]).includes(list)) {
    const entries = await ChecklistEntry.find({ hotel, list, date: { $gte: from, $lte: to } })
      .populate<{ item: { label: string; section: string } | null }>("item", "label section")
      .populate<{ space: { name: string } | null }>("space", "name")
      .sort({ date: 1, createdAt: 1 })
      .lean();
    rows =
      list === "legionella"
        ? [["Date", "Water point", "Cold °C", "Warm °C", "OK", "Signed by", "Time"], ...entries.map((e) => [ymd(e.date), e.space?.name ?? "", e.value, e.value2, e.ok ? "yes" : "NO", e.signerName, new Date(e.createdAt).toISOString().slice(11, 16)])]
        : [["Date", "Shift", "Section", "Item", "°C", "Done", "OK", "Note", "Signed by"], ...entries.map((e) => [ymd(e.date), e.shift, e.item?.section ?? "", e.item?.label ?? "", e.value, e.done ? "yes" : "no", e.ok ? "yes" : "NO", e.note, e.signerName])];
  } else throw new ApiError(404, "Unknown export");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${list}-${ymd(from)}-${ymd(to)}.csv"`);
  res.send(csv(rows));
});
