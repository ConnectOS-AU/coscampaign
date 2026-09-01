export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCampaignQueueWorker } = await import("@/lib/campaign-queue");
    startCampaignQueueWorker();

    const { startEventRegistrationCleanupWorker } = await import("@/lib/event-registration-cleanup");
    startEventRegistrationCleanupWorker();
  }
}
