import type { Request, Response } from "express";
import { ADMIN_ROLES, User } from "../models/user.model";
import { LoginChallenge, TWO_FACTOR_CODE_LENGTH, TWO_FACTOR_MAX_ATTEMPTS, TWO_FACTOR_TTL_MINUTES } from "../models/loginChallenge.model";
import { env } from "../config/env";
import crypto from "crypto";
import { escapeHtml, sendEmail } from "../utils/sendEmail";
import { PasswordReset } from "../models/passwordReset.model";
import { HANDOFF_TTL_SECONDS, LoginHandoff } from "../models/loginHandoff.model";
import { Supplier } from "../models/supplier.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { generateToken } from "../utils/generateToken";
import {
  generateOtp,
  hashOtp,
  compareOtp,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  RESET_TOKEN_TTL_MINUTES,
  generateResetToken,
  hashResetToken,
} from "../utils/otp";
import { sendOtpEmail } from "../utils/sendEmail";

/** "j***@hotel.nl" — tells the admin where the code went without showing the address. */
const maskEmail = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1***$2");

const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();

// ── Sign in ──────────────────────────────────────────────────────────────────
// One sign-in for everyone who uses the dashboard: admins, hotel managers,
// hotel staff and suppliers. The token's role decides what they can see.

export const signin = asyncHandler(async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const user = await User.findOne({ email }).select("+password");

  // Same answer for "no such account" and "wrong password", so sign-in
  // can't be used to find out which email addresses have an account.
  if (!user || !(await user.comparePassword(req.body.password))) {
    throw new ApiError(401, "Invalid email or password");
  }
  if (!user.isActive) {
    throw new ApiError(403, "Your account is inactive. Please contact HotelConnect");
  }

  // Briefing §7: admins need a second step — a code sent to their email.
  if (env.adminTwoFactor && ADMIN_ROLES.includes(user.role)) {
    const challenge = generateResetToken();
    const code = crypto.randomInt(0, 10 ** TWO_FACTOR_CODE_LENGTH).toString().padStart(TWO_FACTOR_CODE_LENGTH, "0");
    await LoginChallenge.create({
      challengeHash: hashResetToken(challenge),
      user: user._id,
      codeHash: await hashOtp(code),
      expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MINUTES * 60_000),
    });
    await sendEmail({
      to: user.email,
      subject: `Your HotelConnect sign-in code: ${code}`,
      html: `<p>Hi ${escapeHtml(user.firstName)},</p>
        <p>Your sign-in code is <strong style="font-size:20px;letter-spacing:4px">${code}</strong>. It is valid for ${TWO_FACTOR_TTL_MINUTES} minutes.</p>
        <p style="color:#6f665b;font-size:12px">Didn't try to sign in? Change your password straight away.</p>`,
    });
    // Local development only: .test addresses get no real email, so show the code here.
    if (!env.isProduction) console.log(`[2fa] sign-in code for ${user.email}: ${code}`);
    return ApiResponse(res, 200, "Enter the code we emailed you", {
      twoFactorRequired: true,
      challenge,
      email: maskEmail(user.email),
    });
  }

  const token = generateToken({ id: String(user._id), role: user.role });

  return ApiResponse(res, 200, "Signin successful", { user, token });
});

/** POST /auth/2fa/verify — the second sign-in step for admins. */
export const verifyTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  const challenge = await LoginChallenge.findOne({
    challengeHash: hashResetToken(String(req.body.challenge)),
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) throw new ApiError(401, "This code has expired. Please sign in again");

  if (!(await compareOtp(String(req.body.code), challenge.codeHash))) {
    challenge.attempts += 1;
    if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      await challenge.deleteOne();
      throw new ApiError(401, "Too many wrong codes. Please sign in again");
    }
    await challenge.save();
    throw new ApiError(401, "This code is not correct");
  }

  await challenge.deleteOne();
  const user = await User.findById(challenge.user);
  if (!user || !user.isActive) throw new ApiError(403, "Your account is inactive. Please contact HotelConnect");
  const token = generateToken({ id: String(user._id), role: user.role });
  return ApiResponse(res, 200, "Signin successful", { user, token });
});

// ── Forgot password ──────────────────────────────────────────────────────────
// Three steps: (1) email → a code is emailed, (2) code → a one-time reset
// token, (3) reset token + new password → password changed.

// Step 1. Also used to resend, at most once per OTP_RESEND_COOLDOWN_SECONDS.
export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body.email);

    const user = await User.findOne({ email });
    if (!user) {
      throw new ApiError(404, "No account found with this email address");
    }
    if (!user.isActive) {
      throw new ApiError(403, "Your account is inactive. Please contact HotelConnect");
    }

    const existing = await PasswordReset.findOne({ identifier: email });
    if (existing) {
      const secondsSinceLastSend =
        (Date.now() - existing.lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new ApiError(
          429,
          `Please wait ${Math.ceil(
            OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend
          )}s before requesting another code.`
        );
      }
    }

    const otp = generateOtp();
    const now = new Date();
    const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

    // A fresh request wipes any earlier code or reset token for this account.
    await PasswordReset.findOneAndUpdate(
      { identifier: email },
      {
        $set: {
          identifier: email,
          user: user._id,
          otpHash: await hashOtp(otp),
          otpExpiresAt,
          attempts: 0,
          lastSentAt: now,
          expiresAt: otpExpiresAt,
        },
        $unset: { resetTokenHash: "", resetTokenExpiresAt: "" },
      },
      { upsert: true }
    );

    await sendOtpEmail(email, otp);

    return ApiResponse(res, 200, "Code sent. Enter it to reset your password.", {
      email,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
    });
  }
);

// Step 2. A correct code is swapped for a reset token — the code can't be
// used again, and the token is what step 3 requires.
export const verifyResetOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body.email);

    const reset = await PasswordReset.findOne({ identifier: email });
    if (!reset || reset.resetTokenHash) {
      throw new ApiError(
        400,
        "No password reset in progress for this email. Please start again."
      );
    }

    if (reset.otpExpiresAt.getTime() < Date.now()) {
      throw new ApiError(400, "This code has expired. Please request a new one.");
    }

    if (reset.attempts >= OTP_MAX_ATTEMPTS) {
      await reset.deleteOne();
      throw new ApiError(
        429,
        "Too many incorrect attempts. Please request a new code."
      );
    }

    const isMatch = await compareOtp(String(req.body.otp), reset.otpHash);
    if (!isMatch) {
      reset.attempts += 1;
      await reset.save();
      throw new ApiError(400, "Incorrect code.");
    }

    const resetToken = generateResetToken();
    const tokenExpiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000
    );
    reset.resetTokenHash = hashResetToken(resetToken);
    reset.resetTokenExpiresAt = tokenExpiresAt;
    reset.expiresAt = tokenExpiresAt;
    await reset.save();

    return ApiResponse(res, 200, "Code verified. You can now set a new password.", {
      email,
      resetToken,
      expiresInSeconds: RESET_TOKEN_TTL_MINUTES * 60,
    });
  }
);

// Step 3. Sets the new password; the reset request is used up, so it can't
// be replayed.
export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body.email);
    const { resetToken, newPassword } = req.body as {
      resetToken: string;
      newPassword: string;
    };

    const reset = await PasswordReset.findOne({ identifier: email });
    const expired =
      !reset?.resetTokenExpiresAt ||
      reset.resetTokenExpiresAt.getTime() < Date.now();
    if (
      !reset ||
      !reset.resetTokenHash ||
      expired ||
      reset.resetTokenHash !== hashResetToken(String(resetToken).trim())
    ) {
      throw new ApiError(
        400,
        "This password reset has expired or is not valid. Please start again."
      );
    }

    const user = await User.findById(reset.user).select("+password");
    if (!user) {
      await reset.deleteOne();
      throw new ApiError(404, "Account not found");
    }

    // Plain text here — the User pre-save hook hashes it.
    user.password = newPassword;
    await user.save();
    await reset.deleteOne();

    return ApiResponse(res, 200, "Password updated. You can now sign in.");
  }
);

// ── Website sign-in for suppliers ────────────────────────────────────────────
// Briefing §2.4: on the public website only signed-in suppliers see "Boek nu".
// Suppliers sign in on the dashboard; the dashboard then asks for a one-time
// code here and sends them back to the website, which exchanges the code.

/** POST /auth/handoff — for a signed-in supplier (supplierOnly). */
export const createHandoff = asyncHandler(async (req: Request, res: Response) => {
  const code = generateResetToken();
  await LoginHandoff.create({
    codeHash: hashResetToken(code),
    user: req.user!._id,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
  });
  return ApiResponse(res, 201, "Sign-in code created", { code, expiresIn: HANDOFF_TTL_SECONDS });
});

/** POST /auth/handoff/exchange — called by the website's server, once per code. */
export const exchangeHandoff = asyncHandler(async (req: Request, res: Response) => {
  const handoff = await LoginHandoff.findOneAndDelete({
    codeHash: hashResetToken(String(req.body.code)),
    expiresAt: { $gt: new Date() },
  });
  if (!handoff) throw new ApiError(401, "This sign-in link has expired. Please sign in again");

  const user = await User.findById(handoff.user);
  if (!user || !user.isActive || user.role !== "supplier" || !user.supplier) {
    throw new ApiError(403, "Only suppliers can sign in on the website");
  }
  const supplier = await Supplier.findOne({ _id: user.supplier, isActive: true }).select("memberNumber name").lean();
  if (!supplier) throw new ApiError(403, "This supplier membership is not active");

  const token = generateToken({ id: String(user._id), role: user.role });
  return ApiResponse(res, 200, "Signed in", {
    token,
    member: { memberNumber: supplier.memberNumber, name: supplier.name },
  });
});

/** GET /auth/member — who is signed in on the website (supplierOnly). */
export const getMember = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Member fetched", {
    member: { memberNumber: req.supplier!.memberNumber, name: req.supplier!.name },
  });
});
