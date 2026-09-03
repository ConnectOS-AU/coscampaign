import { createServiceRoleClient } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/sendgrid";
import { buildEventEmailHtml } from "@/lib/event-email";
import type { EventRegistration } from "@/lib/types";

const POLL_INTERVAL_MS = 30 * 60 * 1000;
const CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * Promotes the longest-waiting *verified* waitlisted registrant to confirmed
 * when a confirmed spot frees up, and lets them know. Only considers already
 * email-confirmed registrants -- an unconfirmed one would be cleaned up by
 * the same 72h rule as everyone else, not promoted. Since registrations can
 * claim more than one ticket, the freed-up spot might not fit the next
 * candidate's ticket_count -- in that case nothing is promoted this round
 * rather than skipping ahead to a smaller one, preserving first-come-first-
 * served order.
 */
async function promoteNextWaitlisted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  eventId: string,
  eventName: string,
  capacity: number | null,
) {
  const { data: next } = await supabase
    .from("marketing_email_event_registrations")
    .select("*")
    .eq("event_id", eventId)
    .eq("status", "waitlisted")
    .not("email_confirmed_at", "is", null)
    .order("registered_at", { ascending: true })
    .limit(1)
    .maybeSingle<EventRegistration>();

  if (!next) return;

  if (capacity !== null) {
    const { data: confirmedRows } = await supabase
      .from("marketing_email_event_registrations")
      .select("ticket_count")
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .returns<{ ticket_count: number }[]>();
    const confirmedTickets = (confirmedRows ?? []).reduce((sum, r) => sum + r.ticket_count, 0);
    if (confirmedTickets + next.ticket_count > capacity) {
      return;
    }
  }

  const { error } = await supabase
    .from("marketing_email_event_registrations")
    .update({ status: "confirmed" })
    .eq("id", next.id);

  if (error) {
    console.error(`[event-registration-cleanup] Failed to promote waitlisted registration ${next.id}:`, error);
    return;
  }

  try {
    await sendTransactionalEmail({
      to: next.verified_email,
      subject: `You're off the waitlist: ${eventName}`,
      html: buildEventEmailHtml({
        eventName,
        bodyHtml: `<p>Hi ${firstName(next.name)},</p><p>A spot opened up for <strong>${eventName}</strong> and you've been moved from the waitlist to confirmed. See you there!</p>`,
      }),
    });
  } catch (err) {
    console.error(`[event-registration-cleanup] Failed to send waitlist-promotion email for ${next.id}:`, err);
  }
  console.log(`[event-registration-cleanup] Promoted waitlisted registration ${next.id} to confirmed`);
}

export async function processUnconfirmedRegistrations(): Promise<void> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - CONFIRMATION_WINDOW_MS).toISOString();

  const { data: stale, error } = await supabase
    .from("marketing_email_event_registrations")
    .select("*")
    .is("email_confirmed_at", null)
    .lt("registered_at", cutoff)
    .returns<EventRegistration[]>();

  if (error) {
    console.error("[event-registration-cleanup] Failed to list unconfirmed registrations:", error);
    return;
  }

  for (const reg of stale ?? []) {
    const { data: event } = await supabase
      .from("marketing_email_events")
      .select("name, capacity")
      .eq("id", reg.event_id)
      .maybeSingle<{ name: string; capacity: number | null }>();
    const eventName = event?.name ?? "the event";

    try {
      await sendTransactionalEmail({
        to: reg.verified_email,
        subject: `Registration cancelled: ${eventName}`,
        html: buildEventEmailHtml({
          eventName,
          bodyHtml: `<p>Hi ${firstName(reg.name)},</p><p>Your registration for <strong>${eventName}</strong> wasn't
            confirmed within 72 hours, so it has been automatically cancelled. If you'd still like to attend,
            you're welcome to register again.</p>`,
        }),
      });
    } catch (err) {
      console.error(`[event-registration-cleanup] Failed to send cancellation email for ${reg.id}:`, err);
    }

    const { error: deleteError } = await supabase
      .from("marketing_email_event_registrations")
      .delete()
      .eq("id", reg.id);

    if (deleteError) {
      console.error(`[event-registration-cleanup] Failed to delete registration ${reg.id}:`, deleteError);
      continue;
    }
    console.log(`[event-registration-cleanup] Cancelled unconfirmed registration ${reg.id} (${reg.event_id})`);

    if (reg.status === "confirmed") {
      await promoteNextWaitlisted(supabase, reg.event_id, eventName, event?.capacity ?? null);
    }
  }
}

let started = false;

export function startEventRegistrationCleanupWorker(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    processUnconfirmedRegistrations().catch((err) =>
      console.error("[event-registration-cleanup] Tick failed:", err),
    );
  }, POLL_INTERVAL_MS);
  console.log(`[event-registration-cleanup] Background worker started (polling every ${POLL_INTERVAL_MS / 60_000}min)`);
}
