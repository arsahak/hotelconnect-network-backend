import { PURCHASE_FILE_RETENTION_DAYS, PurchaseAction } from "../models/purchaseAction.model";
import { PurchaseParticipation } from "../models/purchaseParticipation.model";
import { notifyHotel, notifySupplier } from "./notify";
import { deletePrivate } from "./uploadToSpaces";

/** Number of participants (hotels and contract suppliers) per action. */
export async function participantCounts(actionIds: unknown[]) {
  const counts = await PurchaseParticipation.aggregate<{ _id: unknown; count: number }>([
    { $match: { action: { $in: actionIds } } },
    { $group: { _id: "$action", count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((c) => [String(c._id), c.count]));
}

/** Tells every participant about a status change (melding type "system"). */
export async function notifyParticipants(actionId: unknown, title: string, body: string) {
  const participants = await PurchaseParticipation.find({ action: actionId }).select("hotel supplier").lean();
  await Promise.all(
    participants.map((p) =>
      p.hotel
        ? notifyHotel(String(p.hotel), { type: "system", title, body, link: "/hotel/purchasing" })
        : notifySupplier(String(p.supplier), { type: "system", title, body, link: "/supplier/purchasing" })
    )
  );
}

/**
 * Briefing §3.13 / AVG: the invoices of a completed action are deleted
 * PURCHASE_FILE_RETENTION_DAYS after completion. Runs with the hourly schedule.
 */
export async function deleteExpiredPurchaseFiles(now = new Date()) {
  const cutoff = new Date(now.getTime() - PURCHASE_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const actions = await PurchaseAction.find({ status: "completed", completedAt: { $lte: cutoff }, filesDeletedAt: null }).select("_id");
  let files = 0;
  for (const action of actions) {
    const participations = await PurchaseParticipation.find({ action: action._id, invoice: { $ne: null } });
    for (const p of participations) {
      await deletePrivate(p.invoice?.key);
      p.invoice = null;
      await p.save();
      files += 1;
    }
    action.filesDeletedAt = now;
    await action.save();
  }
  return { actions: actions.length, files };
}
