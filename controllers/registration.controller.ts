import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { Hotel } from "../models/hotel.model";
import { Registration, type IRegistration } from "../models/registration.model";
import { getSettings } from "../models/setting.model";
import { Supplier } from "../models/supplier.model";
import { ADMIN_ROLES, User } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { nextMemberNumber } from "../utils/memberNumber";
import { escapeHtml, sendEmail } from "../utils/sendEmail";
import { uniqueSlug } from "../utils/slugify";
import { startSubscription } from "../services/billing";

// Sign-ups (briefing §3.1, §4.1) and the test-phase switch (§1, §9).

/** Emails are best-effort here: the sign-up itself must not fail on them. */
async function trySend(to: string, subject: string, html: string) {
  try {
    await sendEmail({ to, subject, html });
  } catch (error) {
    console.error(`[registration] email to ${to} failed:`, error instanceof Error ? error.message : error);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** GET /settings — public: is the platform in its test phase? */
export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getSettings();
  return ApiResponse(res, 200, "Settings fetched", { testPhase: settings.testPhase });
});

/** PATCH /settings — admins: open or close registration. */
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await getSettings();
  settings.testPhase = req.body.testPhase;
  await settings.save();
  return ApiResponse(res, 200, settings.testPhase ? "Test phase on: registration is closed" : "Registration is open", {
    testPhase: settings.testPhase,
  });
});

// ── Public sign-up ───────────────────────────────────────────────────────────

const HOTEL_FIELDS = ["address", "city", "region"] as const;
const SUPPLIER_FIELDS = ["categories", "regions", "plan", "website"] as const;

/** POST /registrations — only after the test phase. An admin approves it. */
export const createRegistration = asyncHandler(async (req: Request, res: Response) => {
  const settings = await getSettings();
  if (settings.testPhase) throw new ApiError(403, "Registration opens after the test phase. Please join the waitlist.");

  const email = String(req.body.email);
  if ((await User.exists({ email })) || (await Registration.exists({ email, status: "pending" }))) {
    throw new ApiError(409, "This email address is already registered or waiting for approval");
  }

  const type = req.body.type as IRegistration["type"];
  const extra = Object.fromEntries(
    (type === "hotel" ? HOTEL_FIELDS : SUPPLIER_FIELDS).filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]])
  );
  const registration = await Registration.create({
    type,
    companyName: req.body.companyName,
    kvkNumber: req.body.kvkNumber,
    contactFirstName: req.body.contactFirstName,
    contactLastName: req.body.contactLastName ?? "",
    email,
    phone: req.body.phone ?? "",
    passwordHash: await bcrypt.hash(String(req.body.password), 10),
    ...extra,
  });

  const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: true }).select("email").lean();
  await Promise.all([
    trySend(
      email,
      "We received your registration",
      `<p>Dear ${escapeHtml(registration.contactFirstName)},</p>
       <p>Thank you for registering ${escapeHtml(registration.companyName)} with HotelConnect Network. We check every new member; you get an email as soon as your account is approved.</p>`
    ),
    ...admins.map((admin) =>
      trySend(
        admin.email,
        `New ${type} registration: ${registration.companyName}`,
        `<p>${escapeHtml(registration.companyName)} (KVK ${escapeHtml(registration.kvkNumber)}) registered as a ${type}.</p>
         <p><a href="${env.dashboardUrl}/admin/registrations/${registration._id}" style="color:#9f7b3b">Review the registration</a></p>`
      )
    ),
  ]);

  return ApiResponse(res, 201, "Thank you! We will check your registration and email you.", { _id: registration._id });
});

// ── Admins ───────────────────────────────────────────────────────────────────

export const listRegistrations = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  const items = await Registration.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const pending = await Registration.countDocuments({ status: "pending" });
  return ApiResponse(res, 200, "Registrations fetched", { items, pending });
});

export const getRegistration = asyncHandler(async (req: Request, res: Response) => {
  const registration = await Registration.findById(req.params.id).lean();
  if (!registration) throw new ApiError(404, "Registration not found");
  return ApiResponse(res, 200, "Registration fetched", registration);
});

/** Approving creates the hotel or supplier (with a member number) and its login. */
export const approveRegistration = asyncHandler(async (req: Request, res: Response) => {
  const r = await Registration.findById(req.params.id).select("+passwordHash");
  if (!r) throw new ApiError(404, "Registration not found");
  if (r.status !== "pending") throw new ApiError(409, "This registration was already handled");
  if (await User.exists({ email: r.email })) throw new ApiError(409, "This email address already has a login");

  const contact = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ");
  let memberNumber: string;
  if (r.type === "hotel") {
    const hotel = await Hotel.create({
      name: r.companyName,
      slug: await uniqueSlug(Hotel, r.companyName),
      memberNumber: await nextMemberNumber("hotel"),
      address: r.address,
      city: r.city,
      region: r.region,
      kvkNumber: r.kvkNumber,
      contactPerson: contact,
      phone: r.phone,
      emails: { general: r.email },
    });
    await User.create({ firstName: r.contactFirstName, lastName: r.contactLastName, email: r.email, password: r.passwordHash, role: "hotel_manager", hotel: hotel._id });
    r.member = hotel._id as typeof r.member;
    memberNumber = hotel.memberNumber;
    await startSubscription({ hotel: String(hotel._id) }, "hotel", "year");
  } else {
    const supplier = await Supplier.create({
      name: r.companyName,
      slug: await uniqueSlug(Supplier, r.companyName),
      memberNumber: await nextMemberNumber("supplier"),
      kvkNumber: r.kvkNumber,
      categories: r.categories,
      regions: r.regions,
      plan: r.plan,
      website: r.website,
      contact: { person: contact, email: r.email, phone: r.phone },
    });
    await User.create({ firstName: r.contactFirstName, lastName: r.contactLastName, email: r.email, password: r.passwordHash, role: "supplier", supplier: supplier._id });
    r.member = supplier._id as typeof r.member;
    memberNumber = supplier.memberNumber;
    if (r.plan === "contract") await startSubscription({ supplier: String(supplier._id) }, "supplier-contract", "month");
  }

  r.status = "approved";
  r.decidedAt = new Date();
  await r.save();
  await trySend(
    r.email,
    "Welcome to HotelConnect Network",
    `<p>Dear ${escapeHtml(r.contactFirstName)},</p>
     <p>Your registration for ${escapeHtml(r.companyName)} was approved. Your member number is <strong>${escapeHtml(memberNumber)}</strong>.</p>
     <p>Sign in with your email address and the password you chose:</p>
     <p><a href="${env.dashboardUrl}/sign-in" style="color:#9f7b3b">Sign in to HotelConnect</a></p>`
  );
  return ApiResponse(res, 200, `Approved: ${memberNumber}`, { memberNumber, member: r.member });
});

export const rejectRegistration = asyncHandler(async (req: Request, res: Response) => {
  const r = await Registration.findById(req.params.id);
  if (!r) throw new ApiError(404, "Registration not found");
  if (r.status !== "pending") throw new ApiError(409, "This registration was already handled");
  r.status = "rejected";
  r.rejectionReason = req.body.reason ?? "";
  r.decidedAt = new Date();
  await r.save();
  await trySend(
    r.email,
    "Your registration with HotelConnect Network",
    `<p>Dear ${escapeHtml(r.contactFirstName)},</p>
     <p>Unfortunately we cannot approve the registration of ${escapeHtml(r.companyName)}.</p>
     ${r.rejectionReason ? `<p>${escapeHtml(r.rejectionReason)}</p>` : ""}
     <p>Questions? Reply to this email.</p>`
  );
  return ApiResponse(res, 200, "Registration rejected", r);
});
