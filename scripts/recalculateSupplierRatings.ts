import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Supplier } from "../models/supplier.model";
import { recalculateSupplierRating } from "../utils/supplierRating";

/**
 * Recalculates every supplier's rating from the hotels' reviews (briefing
 * §3.8). Safe to run any time; also fills in the rating of suppliers that
 * were created before ratings existed.
 *
 *   npm run ratings:recalculate
 */
const run = async () => {
  await connectDB();
  const ids = await Supplier.find().distinct("_id");
  for (const id of ids) await recalculateSupplierRating(id);
  console.log(`Recalculated ${ids.length} supplier rating(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Recalculating ratings failed:", err);
  process.exit(1);
});
