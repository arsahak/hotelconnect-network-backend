import { acceptInvites } from "../utils/partners";
import { languageFor, welcomeHotel, welcomeSupplier } from "../utils/emailTemplates";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { Hotel } from "../models/hotel.model";
import { Registration, type IRegistration } from "../models/registration.model";
import { FEATURE_KEYS, getFeatures, getSettings } from "../models/setting.model";
import { Supplier } from "../models/supplier.model";
import { ADMIN_ROLES, User } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { nextMemberNumber } from "../utils/memberNumber";
import { escapeHtml, sendEmail } from "../utils/sendEmail";
import { uniqueSlug } from "../utils/slugify";
import { startSubscription } from "../services/billing";
import { supplierPlan } from "../config/billing";

// Sign-ups (briefing §3.1, §4.1) and the test-phase switch (§1, §9).

/** Emails are best-effort here: the sign-up itself must not fail on them. */
async function trySend(to: string, subject: string, html: string, from?: "info" | "noreply") {
  try {
    await sendEmail({ to, subject, html, from });
  } catch (error) {
    console.error(`[registration] email to ${to} failed:`, error instanceof Error ? error.message : error);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** GET /settings — public: test phase, and which Phase 2 features are on. */
export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getSettings();
  return ApiResponse(res, 200, "Settings fetched", { testPhase: settings.testPhase, features: await getFeatures() });
});

/** PATCH /settings — admins: open or close registration; switch Phase 2 features on or off. */
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await getSettings();
  if (typeof req.body.testPhase === "boolean") settings.testPhase = req.body.testPhase;
  for (const key of FEATURE_KEYS) {
    if (typeof req.body.features?.[key] === "boolean") settings.set(`features.${key}`, req.body.features[key]);
  }
  await settings.save();
  const message = typeof req.body.testPhase === "boolean" ? (settings.testPhase ? "Test phase on: registration is closed" : "Registration is open") : "Saved";
  return ApiResponse(res, 200, message, { testPhase: settings.testPhase, features: await getFeatures() });
});

// ── Public sign-up ───────────────────────────────────────────────────────────

const HOTEL_FIELDS = ["legalName", "vatNumber", "address", "postalCode", "city", "region", "rooms", "billingEmail", "bookingUrl"] as const;
const SUPPLIER_FIELDS = ["categories", "regions", "plan", "website", "invite"] as const;

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
    country: req.body.country,
    // Clickwrap audit trail: date/time, IP (the website passes the visitor's), version and documents.
    termsAcceptedAt: new Date(),
    termsIp: req.body.clientIp || req.ip || "",
    termsVersion: req.body.termsVersion ?? "",
    termsDocuments: req.body.termsDocuments ?? [],
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
  const pending = await Registration.countDocuments({ status: { $in: ["pending", "waiting"] } });
  return ApiResponse(res, 200, "Registrations fetched", { items, pending });
});

export const getRegistration = asyncHandler(async (req: Request, res: Response) => {
  const registration = await Registration.findById(req.params.id).lean();
  if (!registration) throw new ApiError(404, "Registration not found");
  return ApiResponse(res, 200, "Registration fetched", registration);
});

const OPEN = ["pending", "waiting"];

/**
 * Client (31 Oct): the supplier chooses a plan; the admin checks the company.
 * If something does not match, the admin emails a question and the
 * registration waits for the answer (replies go to the admin's address).
 */
export const askRegistration = asyncHandler(async (req: Request, res: Response) => {
  const r = await Registration.findById(req.params.id);
  if (!r) throw new ApiError(404, "Registration not found");
  if (!OPEN.includes(r.status)) throw new ApiError(409, "This registration was already handled");
  const text = String(req.body.message);
  r.status = "waiting";
  r.messages.push({ text, sentAt: new Date() });
  await r.save();
  try {
    await sendEmail({
      to: r.email,
      replyTo: req.user!.email,
      subject: `Your registration with HotelConnect Network: a question`,
      html: `<p>Dear ${escapeHtml(r.contactFirstName)},</p>
        <p>Thank you for registering ${escapeHtml(r.companyName)}. Before we approve it, we have a question:</p>
        <p style="white-space:pre-line;padding:12px 16px;background:#f5f0e8;border-radius:6px">${escapeHtml(text)}</p>
        <p>Please reply to this email.</p>`,
    });
  } catch (error) {
    console.error(`[registration] question to ${r.email} failed:`, error instanceof Error ? error.message : error);
    throw new ApiError(502, "The question was saved, but the email could not be sent");
  }
  return ApiResponse(res, 200, "Question sent; the registration waits for the answer", r);
});

/** Approving creates the hotel or supplier (with a member number) and its login. The admin may set the final plan. */
export const approveRegistration = asyncHandler(async (req: Request, res: Response) => {
  const r = await Registration.findById(req.params.id).select("+passwordHash +invite");
  if (!r) throw new ApiError(404, "Registration not found");
  if (!OPEN.includes(r.status)) throw new ApiError(409, "This registration was already handled");
  if (r.type === "supplier" && req.body.plan) r.plan = req.body.plan;
  if (await User.exists({ email: r.email })) throw new ApiError(409, "This email address already has a login");

  const contact = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ");
  let memberNumber: string;
  if (r.type === "hotel") {
    const hotel = await Hotel.create({
      name: r.companyName,
      slug: await uniqueSlug(Hotel, r.companyName),
      memberNumber: await nextMemberNumber("hotel"),
      country: r.country,
      legalName: r.legalName,
      vatNumber: r.vatNumber,
      address: r.address,
      postalCode: r.postalCode,
      city: r.city,
      region: r.country === "NL" ? r.region : "",
      kvkNumber: r.kvkNumber,
      contactPerson: contact,
      phone: r.phone,
      bookingUrl: r.bookingUrl,
      facilities: { rooms: r.rooms },
      emails: { general: r.email, ...(r.billingEmail ? { invoices: r.billingEmail } : {}) },
    });
    await User.create({ firstName: r.contactFirstName, lastName: r.contactLastName, email: r.email, password: r.passwordHash, role: "hotel_manager", hotel: hotel._id });
    r.member = hotel._id as typeof r.member;
    memberNumber = hotel.memberNumber;
    await startSubscription({ hotel: String(hotel._id) }, "hotel");
  } else {
    const supplier = await Supplier.create({
      name: r.companyName,
      slug: await uniqueSlug(Supplier, r.companyName),
      memberNumber: await nextMemberNumber("supplier"),
      kvkNumber: r.kvkNumber,
      country: r.country,
      categories: r.categories,
      regions: r.regions,
      plan: r.plan,
      website: r.website,
      contact: { person: contact, email: r.email, phone: r.phone },
    });
    await User.create({ firstName: r.contactFirstName, lastName: r.contactLastName, email: r.email, password: r.passwordHash, role: "supplier", supplier: supplier._id });
    r.member = supplier._id as typeof r.member;
    memberNumber = supplier.memberNumber;
    // v4: hotels that invited this supplier (link or same email) become its partner hotels.
    await acceptInvites(supplier._id, r.email, r.invite);
    // v4: every supplier gets a membership — free until 1 May 2028.
    await startSubscription({ supplier: String(supplier._id) }, supplierPlan(r.plan));
  }

  r.status = "approved";
  r.decidedAt = new Date();
  await r.save();
  // Master Briefing v4 emails 6.1 (hotel) and 6.3 (supplier), in the member's language.
  const lang = languageFor({ country: r.country });
  const mail =
    r.type === "hotel"
      ? welcomeHotel(lang, { managerName: r.contactFirstName, hotelName: r.companyName, loginLink: `${env.dashboardUrl}/sign-in`, founding: false })
      : welcomeSupplier(lang, { supplierName: r.companyName, portalLink: `${env.dashboardUrl}/supplier/tenders` });
  await trySend(r.email, mail.subject, mail.html, mail.from);
  return ApiResponse(res, 200, `Approved: ${memberNumber}`, { memberNumber, member: r.member });
});

export const rejectRegistration = asyncHandler(async (req: Request, res: Response) => {
  const r = await Registration.findById(req.params.id);
  if (!r) throw new ApiError(404, "Registration not found");
  if (!OPEN.includes(r.status)) throw new ApiError(409, "This registration was already handled");
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
