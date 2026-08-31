import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Smallest valid 1x1 transparent GIF.
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
  "base64",
);

function gifResponse(): Response {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string; contact: string; segment: string }> },
) {
  const { campaignId, contact, segment } = await params;
  const segmentNum = Number(segment);

  if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !contact || ![1, 2, 3, 4].includes(segmentNum)) {
    return gifResponse();
  }

  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("marketing_email_engagement_pixels")
      .upsert(
        { campaign_id: campaignId, contact_email: decodeURIComponent(contact), segment: segmentNum },
        { onConflict: "campaign_id,contact_email,segment", ignoreDuplicates: true },
      );
  } catch (err) {
    console.error("Failed to record read-depth pixel:", err);
  }

  return gifResponse();
}
