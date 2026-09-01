import { notFound, redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listContactLists, listSegments, listVerifiedSenders, listSuppressionGroups } from "@/lib/sendgrid";
import type { Campaign, EmailTemplate, LibraryImage } from "@/lib/types";
import { CampaignEditor } from "./campaign-editor";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!hasPermission(session, "manage_campaigns")) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">You don&apos;t have access to manage campaigns.</p>
      </div>
    );
  }

  const supabase = createServiceRoleClient();

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
  const [lists, segments, senders, suppressionGroups, { data: templates }, { data: libraryImages }] =
    await Promise.all([
      listContactLists().catch(() => []),
      listSegments().catch(() => []),
      listVerifiedSenders().catch(() => []),
      listSuppressionGroups().catch(() => []),
      supabase
        .from("marketing_email_templates")
        .select("id, name, unlayer_design_json")
        .order("name")
        .returns<Pick<EmailTemplate, "id" | "name" | "unlayer_design_json">[]>(),
      supabase.from("marketing_email_image_library").select("*").order("name").returns<LibraryImage[]>(),
    ]);

  return (
    <CampaignEditor
      campaign={campaign}
      lists={lists}
      segments={segments}
      senders={senders}
      suppressionGroups={suppressionGroups}
      templates={templates ?? []}
      libraryImages={libraryImages ?? []}
    />
  );
}
