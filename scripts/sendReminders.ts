import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { sendDueReminders } from "../utils/reminders";

// Sends the due contract and permit reminders once. The API server already
// does this every hour; use this for a hosting cron job or to test.
const run = async () => {
  await connectDB();
  const { hotels, reminders } = await sendDueReminders();
  console.log(`Sent ${reminders} reminder(s) to ${hotels} hotel(s).`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
