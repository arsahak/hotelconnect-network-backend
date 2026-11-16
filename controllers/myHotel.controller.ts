import { hotelProgress } from "../utils/hotelProgress";
import type { Request, Response } from "express";
import { Contract, noticeDeadline } from "../models/contract.model";
import { FaultContact } from "../models/faultContact.model";
import { Hotel } from "../models/hotel.model";
import { Permit } from "../models/permit.model";
import { User } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { complianceSuggestions } from "../utils/complianceProfile";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";

// The signed-in hotel's own data (hotel managers; the staff login may read
// the basics). Always req.user.hotel — never an id from the request.

const EDITABLE = ["name", "legalName", "kvkNumber", "vatNumber", "country", "address", "postalCode", "city", "region", "contactPerson", "phone", "description", "bookingUrl", "offer"] as const;

async function myHotel(req: Request) {
  const hotel = await Hotel.findById(req.user!.hotel);
  if (!hotel) throw new ApiError(404, "Your hotel was not found");
  return hotel;
}

/** The hotel as the dashboard needs it: with the compliance suggestions. */
const withCompliance = (hotel: Awaited<ReturnType<typeof myHotel>>) => ({
  ...hotel.toJSON(),
  compliance: complianceSuggestions(hotel.facilities),
});

export const getMyHotel = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Hotel fetched successfully", withCompliance(await myHotel(req)));
});

/** GET /my-hotel/progress — the onboarding progress bar (Master Briefing v4). */
export const getMyProgress = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Progress fetched", await hotelProgress(await myHotel(req)));
});

export const updateMyHotel = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await myHotel(req);
  hotel.set(pick(req.body, EDITABLE));
  for (const group of ["emails", "notify", "notificationChannels", "notificationPush", "facilities"] as const) {
    const values = req.body[group];
    if (values && typeof values === "object") {
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) hotel.set(`${group}.${key}`, value);
      }
    }
  }
  await hotel.save();
  return ApiResponse(res, 200, "Your hotel was saved", withCompliance(hotel));
});

const IMAGE = { field: "image", keyField: "imageKey", folder: "hotels" };

export const uploadMyHotelImage = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await myHotel(req);
  await replaceImage(hotel, req.file, IMAGE);
  return ApiResponse(res, 200, "Photo updated successfully", withCompliance(hotel));
});

export const deleteMyHotelImage = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await myHotel(req);
  await removeImage(hotel, IMAGE);
  return ApiResponse(res, 200, "Photo removed successfully", withCompliance(hotel));
});

// ── Onboarding (briefing §3.2) ──────────────────────────────────────────────

/** Remembers how far the hotel got, so it can continue later. */
export const saveOnboardingStep = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await myHotel(req);
  hotel.onboarding.step = Math.max(hotel.onboarding.step ?? 1, req.body.step);
  await hotel.save();
  return ApiResponse(res, 200, "Progress saved", hotel.onboarding);
});

/** Step 8, "Confirm": from now on the hotel uses its dashboard. */
export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await myHotel(req);
  const missing = [
    !hotel.name && "hotel name",
    !hotel.address && "address",
    !hotel.emails?.general && "general email address",
  ].filter(Boolean);
  if (missing.length) throw new ApiError(422, `Please fill in: ${missing.join(", ")}`);

  hotel.onboarding.step = 8;
  hotel.onboarding.completedAt = new Date();
  await hotel.save();
  return ApiResponse(res, 200, "Welcome to HotelConnect", hotel.onboarding);
});

// ── Year calendar (briefing §3.3) ───────────────────────────────────────────

type CalendarEvent = {
  date: Date;
  kind: "contract_end" | "notice_deadline" | "permit_expiry";
  title: string;
  subtitle?: string;
  refType: "contract" | "permit";
  refId: string;
};

/**
 * Everything that expires, from the contract register and the permits page:
 * contract end dates, last days to cancel (automatic renewal) and permit
 * expiry dates. `events` covers this month + the next 11; `overdue` lists
 * what already passed in the last 6 months.
 */
export const getCalendar = asyncHandler(async (req: Request, res: Response) => {
  const hotelId = req.user!.hotel;
  const [contracts, permits, faultContacts] = await Promise.all([
    Contract.find({ hotel: hotelId }).lean(),
    Permit.find({ hotel: hotelId }).lean(),
    FaultContact.countDocuments({ hotel: hotelId }),
  ]);

  const all: CalendarEvent[] = [];
  for (const c of contracts) {
    const title = c.contractFor || c.company || "Contract";
    const subtitle = c.contractFor && c.company ? c.company : undefined;
    if (c.endDate) all.push({ date: c.endDate, kind: "contract_end", title, subtitle, refType: "contract", refId: String(c._id) });
    const deadline = noticeDeadline(c);
    if (deadline) all.push({ date: deadline, kind: "notice_deadline", title, subtitle, refType: "contract", refId: String(c._id) });
  }
  for (const p of permits) {
    if (p.expiryDate) {
      all.push({ date: p.expiryDate, kind: "permit_expiry", title: p.type, subtitle: p.authority || undefined, refType: "permit", refId: String(p._id) });
    }
  }
  all.sort((a, b) => a.date.getTime() - b.date.getTime());

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  const overdueFrom = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

  const withCost = contracts.filter((c) => typeof c.costPerYear === "number");
  return ApiResponse(res, 200, "Calendar fetched successfully", {
    from,
    to,
    events: all.filter((e) => e.date >= from && e.date < to),
    overdue: all.filter((e) => e.date < today && e.date >= overdueFrom),
    summary: {
      contracts: contracts.length,
      permits: permits.length,
      faultContacts,
      costPerYear: withCost.length ? withCost.reduce((sum, c) => sum + (c.costPerYear ?? 0), 0) : null,
    },
  });
});

// ── Staff login (briefing §3.6) ─────────────────────────────────────────────

/** The hotel's shared staff login: only sees the storingslijst. */
/** The older single staff login of a hotel (not the personal staff accounts). */
const SHARED_LOGIN = { role: "hotel_staff", hotelRole: { $in: [null, "shared"] } };

export const getStaffLogin = asyncHandler(async (req: Request, res: Response) => {
  const staff = await User.findOne({ hotel: req.user!.hotel, ...SHARED_LOGIN }).select("email isActive updatedAt").lean();
  return ApiResponse(res, 200, "Staff login fetched successfully", staff);
});

/** Creates the staff login, or changes its email and/or password. */
export const saveStaffLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password?: string };
  const hotel = await myHotel(req);

  const taken = await User.findOne({ email });
  let staff = await User.findOne({ hotel: hotel._id, ...SHARED_LOGIN }).select("+password");
  if (taken && (!staff || taken.id !== staff.id)) throw new ApiError(409, "This email address is already used by another account");

  if (!staff) {
    if (!password) throw new ApiError(422, "Choose a password for the new staff login");
    staff = await User.create({ firstName: `${hotel.name} staff`, email, password, role: "hotel_staff", hotelRole: "shared", hotel: hotel._id });
  } else {
    staff.email = email;
    if (password) staff.password = password;
    await staff.save();
  }
  return ApiResponse(res, 200, "Staff login saved", { email: staff.email, isActive: staff.isActive, updatedAt: staff.updatedAt });
});

export const deleteStaffLogin = asyncHandler(async (req: Request, res: Response) => {
  await User.deleteOne({ hotel: req.user!.hotel, ...SHARED_LOGIN });
  return ApiResponse(res, 200, "Staff login removed");
});

