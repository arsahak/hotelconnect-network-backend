import type { Request, Response } from "express";
import { WaitlistEntry } from "../models/waitlist.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { addToMailingList } from "../utils/mailingList";

/** Test phase: sign-ups are closed, so visitors join the waitlist (briefing §1). */
export const joinWaitlist = asyncHandler(async (req: Request, res: Response) => {
  const { email, type } = req.body as { email: string; type: "hotel" | "supplier" };

  const existing = await WaitlistEntry.findOne({ email });
  if (existing) {
    return ApiResponse(res, 200, "You are already on the waitlist", { alreadyListed: true });
  }

  await WaitlistEntry.create({ email, type });
  // The mailing-list tool (Brevo) is a copy for sending the "we're open" email;
  // a failure there must not lose the sign-up, which is already saved above.
  addToMailingList(email, { MEMBER_TYPE: type }).catch((err) =>
    console.error("Waitlist mailing-list sync failed:", err)
  );

  return ApiResponse(res, 201, "You are on the waitlist", { alreadyListed: false });
});
