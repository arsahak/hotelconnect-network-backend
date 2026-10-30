import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { env } from "../config/env";
import { Hotel } from "../models/hotel.model";
import { Supplier } from "../models/supplier.model";
import { HOTEL_ROLES, User, type UserRole } from "../models/user.model";

/**
 * Local development only: one test account per role, so every dashboard menu
 * can be checked. All share TEST_USERS_PASSWORD (default below). The hotel
 * manager and staff logins belong to the first demo hotel, the supplier login
 * to the first demo supplier (run seed:demo first).
 *
 *   npm run seed:test-users
 */
const PASSWORD = process.env.TEST_USERS_PASSWORD || "TestPass2026!";

const TEST_USERS: { email: string; firstName: string; lastName: string; role: UserRole }[] = [
  { email: "admin@hotelconnect.test", firstName: "Test", lastName: "Admin", role: "admin" },
  { email: "manager@hotelconnect.test", firstName: "Test", lastName: "Hotel Manager", role: "hotel_manager" },
  { email: "staff@hotelconnect.test", firstName: "Test", lastName: "Hotel Staff", role: "hotel_staff" },
  { email: "supplier@hotelconnect.test", firstName: "Test", lastName: "Supplier", role: "supplier" },
  { email: "superadmin@hotelconnect.test", firstName: "Test", lastName: "Superadmin", role: "superadmin" },
];

const run = async () => {
  if (env.isProduction) {
    console.error("seed:test-users is for local development only.");
    process.exit(1);
  }

  await connectDB();
  const hotel = await Hotel.findOne({ slug: "hotel-de-gracht" }).select("_id name").lean();
  const supplier = await Supplier.findOne({ isActive: true }).sort({ memberNumber: 1 }).select("_id name").lean();

  for (const data of TEST_USERS) {
    const link =
      HOTEL_ROLES.includes(data.role) && hotel
        ? { field: "hotel" as const, id: hotel._id, name: hotel.name }
        : data.role === "supplier" && supplier
          ? { field: "supplier" as const, id: supplier._id, name: supplier.name }
          : null;
    const linkData = link ? { [link.field]: link.id } : {};

    const existing = await User.findOne({ email: data.email });
    if (existing) {
      if (link && String(existing[link.field]) !== String(link.id)) {
        existing.set(linkData);
        await existing.save();
        console.log(`linked   ${data.role.padEnd(13)} ${data.email} → ${link.name}`);
      } else console.log(`exists   ${data.role.padEnd(13)} ${data.email}`);
      continue;
    }
    await User.create({ ...data, ...linkData, password: PASSWORD });
    console.log(`created  ${data.role.padEnd(13)} ${data.email}${link ? ` → ${link.name}` : ""}`);
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seeding test users failed:", err);
  process.exit(1);
});
