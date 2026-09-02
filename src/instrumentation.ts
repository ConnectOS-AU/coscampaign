export async function register() {
  // Dev instances (npm run dev / next dev) point at the exact same Supabase
  // database as production -- there's no separate dev database in this repo.
  // If these background workers started under `next dev` too, a developer's
  // local session would race the production server to claim queued sends and
  // unconfirmed registrations, finalizing them with the developer's local
  // NEXT_PUBLIC_APP_URL baked into tracking links instead of the real site's.
  // This actually happened once during development -- see commit history.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startCampaignQueueWorker } = await import("@/lib/campaign-queue");
    startCampaignQueueWorker();

    const { startEventRegistrationCleanupWorker } = await import("@/lib/event-registration-cleanup");
    startEventRegistrationCleanupWorker();
  }
}
