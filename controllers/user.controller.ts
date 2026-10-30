import type { Request, Response } from "express";
import { ADMIN_ROLES, User, type UserRole } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToSpaces, deleteFromSpaces } from "../utils/uploadToSpaces";

// Platform team = the admins who run HotelConnect. Only a superadmin can add,
// change or remove team members; an admin can see the team.
const MANAGEABLE_ROLES_BY: Partial<Record<UserRole, UserRole[]>> = {
  superadmin: ["admin", "superadmin"],
  admin: [],
};

const manageableRoles = (role: UserRole) => MANAGEABLE_ROLES_BY[role] ?? [];

const assertEmailFree = async (email: string, exceptId?: string) => {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing && existing.id !== exceptId) {
    throw new ApiError(409, "Email is already registered");
  }
};

// ── Platform team ────────────────────────────────────────────────────────────

export const listTeam = asyncHandler(async (_req: Request, res: Response) => {
  const team = await User.find({ role: { $in: ADMIN_ROLES } }).sort({
    createdAt: -1,
  });
  return ApiResponse(res, 200, "Team fetched successfully", team);
});

export const getTeamMember = asyncHandler(
  async (req: Request, res: Response) => {
    const member = await User.findOne({
      _id: req.params.id,
      role: { $in: ADMIN_ROLES },
    });
    if (!member) throw new ApiError(404, "Team member not found");
    return ApiResponse(res, 200, "Team member fetched successfully", member);
  }
);

export const createTeamMember = asyncHandler(
  async (req: Request, res: Response) => {
    const { firstName, lastName, phone, email, password, role } = req.body;

    if (!manageableRoles(req.user!.role).includes(role)) {
      throw new ApiError(
        403,
        `You are not allowed to create a user with role "${role}"`
      );
    }

    await assertEmailFree(email);

    const user = await User.create({
      firstName,
      lastName,
      phone,
      email,
      password,
      role,
    });

    return ApiResponse(res, 201, "Team member created successfully", user);
  }
);

export const updateTeamMember = asyncHandler(
  async (req: Request, res: Response) => {
    const requester = req.user!;
    const allowed = manageableRoles(requester.role);

    const target = await User.findOne({
      _id: req.params.id,
      role: { $in: allowed },
    });
    if (!target) throw new ApiError(404, "Team member not found");

    if (target.id === requester.id) {
      throw new ApiError(
        400,
        "Use your own account settings to update your account"
      );
    }

    const { firstName, lastName, email, phone, role, isActive } = req.body;

    if (role !== undefined && !allowed.includes(role)) {
      throw new ApiError(403, `You are not allowed to assign the role "${role}"`);
    }
    if (email) await assertEmailFree(email, target.id);

    if (firstName !== undefined) target.firstName = firstName;
    if (lastName !== undefined) target.lastName = lastName;
    if (email !== undefined) target.email = email;
    if (phone !== undefined) target.phone = phone;
    if (role !== undefined) target.role = role;
    if (isActive !== undefined) target.isActive = isActive;

    await target.save();

    return ApiResponse(res, 200, "Team member updated successfully", target);
  }
);

export const deleteTeamMember = asyncHandler(
  async (req: Request, res: Response) => {
    const requester = req.user!;

    const target = await User.findOne({
      _id: req.params.id,
      role: { $in: manageableRoles(requester.role) },
    });
    if (!target) throw new ApiError(404, "Team member not found");

    if (target.id === requester.id) {
      throw new ApiError(400, "You cannot delete your own account");
    }

    const avatarKey = target.avatarKey;
    await target.deleteOne();
    if (avatarKey) await deleteFromSpaces(avatarKey);

    return ApiResponse(res, 200, "Team member deleted successfully");
  }
);

// ── Own account (every signed-in user) ───────────────────────────────────────

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Profile fetched successfully", req.user);
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const { firstName, lastName, email, phone } = req.body;

  if (email) await assertEmailFree(email, requester.id);

  if (firstName !== undefined) requester.firstName = firstName;
  if (lastName !== undefined) requester.lastName = lastName;
  if (email !== undefined) requester.email = email;
  if (phone !== undefined) requester.phone = phone;

  await requester.save();

  return ApiResponse(res, 200, "Profile updated successfully", requester);
});

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    const requester = await User.findById(req.user!.id).select("+password");
    if (!requester) throw new ApiError(401, "User no longer exists");

    const matches = await requester.comparePassword(currentPassword);
    if (!matches) throw new ApiError(401, "Current password is incorrect");

    requester.password = newPassword;
    await requester.save();

    return ApiResponse(res, 200, "Password updated successfully");
  }
);

export const updateAvatar = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.file) throw new ApiError(422, "Avatar image file is required");

    const requester = req.user!;
    const previousAvatarKey = requester.avatarKey;

    const uploaded = await uploadToSpaces(req.file, "avatars");
    requester.avatar = uploaded.url;
    requester.avatarKey = uploaded.key;

    try {
      await requester.save();
    } catch (err) {
      await deleteFromSpaces(uploaded.key);
      throw err;
    }

    if (previousAvatarKey) {
      await deleteFromSpaces(previousAvatarKey);
    }

    return ApiResponse(res, 200, "Avatar updated successfully", requester);
  }
);
