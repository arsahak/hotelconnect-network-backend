import { Counter } from "../models/counter.model";

export type MemberType = "hotel" | "supplier";

// Briefing: hotels are H0001, H0002, …; suppliers are L001, L002, …
const FORMAT: Record<MemberType, { prefix: string; digits: number }> = {
  hotel: { prefix: "H", digits: 4 },
  supplier: { prefix: "L", digits: 3 },
};

/** Hands out the next member number for a hotel or supplier. */
export async function nextMemberNumber(type: MemberType): Promise<string> {
  const counter = await Counter.findByIdAndUpdate(
    type,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const { prefix, digits } = FORMAT[type];
  return `${prefix}${String(counter!.seq).padStart(digits, "0")}`;
}

export const MEMBER_NUMBER_REGEX = /^(H\d{4,}|L\d{3,})$/;
