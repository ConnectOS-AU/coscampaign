import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listContactLists, listSegments, listVerifiedSenders, listSuppressionGroups } from "@/lib/sendgrid";
import type { Campaign } from "@/lib/types";
import { CampaignEditor } from "./campaign-editor";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign, error } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", id)
    .single<Campaign>();

  if (error || !campaign) {
    notFound();
  }

  if (campaign.status !== "draft") {
    redirect(`/campaigns/${id}/report`);
  }

  // These fail independently of the DB fetch above; if SendGrid isn't
  // configured yet we still want the editor to load so drafting can start.
  const [lists, segments, senders, suppressionGroups] = await Promise.all([
    listContactLists().catch(() => []),
    listSegments().catch(() => []),
    listVerifiedSenders().catch(() => []),
    listSuppressionGroups().catch(() => []),
  ]);

  return (
    <CampaignEditor
      campaign={campaign}
      lists={lists}
      segments={segments}
      senders={senders}
      suppressionGroups={suppressionGroups}
    />
  );
}
