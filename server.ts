import { createServer } from "http";
import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { startReminderSchedule } from "./utils/reminders";

const start = async () => {
  try {
    const dbHost = await connectDB();

    const server = createServer(app);
    server.listen(env.port, () => {
      const baseUrl = `http://localhost:${env.port}`;
      const divider = "-".repeat(50);

      console.log(divider);
      console.log(`  ${env.appName} API`);
      console.log(`  Environment    ${env.nodeEnv}`);
      console.log(`  Database       ${env.dbName} @ ${dbHost}`);
      console.log(`  Local          ${baseUrl}`);
      console.log(`  API Base       ${baseUrl}/api/v1`);
      console.log(`  API Docs       ${baseUrl}/api-docs`);
      console.log(`  Health Check   ${baseUrl}/api/v1/health`);
      console.log(divider);

      // Contract and permit reminders (briefing §3.4.1, §3.4.4).
      startReminderSchedule();
    });

    process.on("unhandledRejection", (err: Error) => {
      console.error(`Unhandled Rejection: ${err.message}`);
      server.close(() => process.exit(1));
    });
  } catch (err) {
    console.error(`Failed to start server: ${(err as Error).message}`);
    process.exit(1);
  }
};

start();
