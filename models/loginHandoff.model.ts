import mongoose, { Schema, Document } from "mongoose";

/** How long the website has to exchange a handoff code. */
export const HANDOFF_TTL_SECONDS = 60;

/**
 * One-time code that carries a dashboard sign-in over to the public website
 * (briefing §2.4: "Boek nu" only for signed-in suppliers). The dashboard asks
 * for a code, sends the visitor to the website with it, and the website
 * exchanges it once for a token. Only the code's SHA-256 is stored.
 */
export interface ILoginHandoff extends Document {
  codeHash: string;
  user: mongoose.Types.ObjectId;
  expiresAt: Date;
}

const loginHandoffSchema = new Schema<ILoginHandoff>({
  codeHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB removes expired codes on its own.
loginHandoffSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginHandoff = mongoose.model<ILoginHandoff>("LoginHandoff", loginHandoffSchema);
