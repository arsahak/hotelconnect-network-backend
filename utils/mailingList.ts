import { env } from "../config/env";

/**
 * Adds a contact to the Brevo waitlist (briefing §7: MailerLite or Brevo for
 * mailing lists). Does nothing until BREVO_API_KEY and
 * BREVO_WAITLIST_LIST_ID are set, so the waitlist works without it.
 */
export async function addToMailingList(
  email: string,
  attributes: Record<string, string> = {}
): Promise<void> {
  const { apiKey, waitlistListId } = env.brevo;
  if (!apiKey || !waitlistListId) return;

  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      email,
      attributes,
      listIds: [waitlistListId],
      updateEnabled: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Brevo responded ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
