import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { deleteFromSpaces } from "../utils/uploadToSpaces";

// Staff accounts of the signed-in hotel (Master Briefing v4): GM, department
// manager and staff, each with a department. GMs are hotel managers; the
// others sign in as hotel staff (the floor app).

const FIELDS = "firstName lastName email role hotelRole department language isActive createdAt updatedAt";

/** GM → hotel_manager; department manager / staff → hotel_staff. */
const roleFor = (hotelRole: string) => (hotelRole === "gm" ? "hotel_manager" : "hotel_staff");

const present = (u: Record<string, unknown>) => ({ ...u, hotelRole: u.hotelRole ?? (u.role === "hotel_manager" ? "gm" : "shared") });

/** GET /my-hotel/staff — everyone with a login for this hotel. */
export const listStaff = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.find({ hotel: req.user!.hotel }).select(FIELDS).sort({ role: 1, firstName: 1 }).lean();
  return ApiResponse(res, 200, "Staff fetched successfully", users.map((u) => present(u as never)));
});

/** POST /my-hotel/staff — a new personal account; the GM shares the first password. */
export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, email, password, hotelRole, department, language } = req.body;
  if (await User.exists({ email })) throw new ApiError(409, "This email address is already used by another account");
  const user = await User.create({
    firstName,
    lastName: lastName ?? "",
    email,
    password,
    role: roleFor(hotelRole),
    hotelRole,
    department: hotelRole === "gm" ? "" : department ?? "",
    language: language || null,
    hotel: req.user!.hotel,
  });
  const { password: _pw, ...rest } = user.toObject();
  return ApiResponse(res, 201, "Account created", present(rest as never));
});

/** PATCH /my-hotel/staff/:id — name, role, department, language, active, new password. */
export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOne({ _id: req.params.id, hotel: req.user!.hotel }).select("+password");
  if (!user) throw new ApiError(404, "Account not found");
  const self = String(user._id) === String(req.user!._id);

  const { firstName, lastName, hotelRole, department, language, isActive, password } = req.body;
  if (self && (isActive === false || (hotelRole && hotelRole !== "gm"))) throw new ApiError(409, "You cannot deactivate or demote your own account");
  if (user.role === "hotel_manager" && (isActive === false || (hotelRole && hotelRole !== "gm"))) {
    const otherGms = await User.countDocuments({ hotel: req.user!.hotel, role: "hotel_manager", isActive: true, _id: { $ne: user._id } });
    if (!otherGms) throw new ApiError(409, "A hotel always needs at least one active GM");
  }

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (hotelRole) {
    user.hotelRole = hotelRole;
    user.role = roleFor(hotelRole);
    if (hotelRole === "gm") user.department = "";
  }
  if (department !== undefined && user.hotelRole !== "gm") user.department = department;
  if (language !== undefined) user.language = language || null;
  if (typeof isActive === "boolean") user.isActive = isActive;
  if (password) user.password = password;
  await user.save();

  const { password: _pw, ...rest } = user.toObject();
  return ApiResponse(res, 200, "Account saved", present(rest as never));
});

/** DELETE /my-hotel/staff/:id — not yourself, not the last GM. */
export const deleteStaff = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOne({ _id: req.params.id, hotel: req.user!.hotel });
  if (!user) throw new ApiError(404, "Account not found");
  if (String(user._id) === String(req.user!._id)) throw new ApiError(409, "You cannot delete your own account");
  if (user.role === "hotel_manager") {
    const otherGms = await User.countDocuments({ hotel: req.user!.hotel, role: "hotel_manager", isActive: true, _id: { $ne: user._id } });
    if (!otherGms) throw new ApiError(409, "A hotel always needs at least one active GM");
  }
  await user.deleteOne();
  await deleteFromSpaces(user.avatarKey);
  return ApiResponse(res, 200, "Account deleted");
});
