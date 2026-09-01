"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import type { EmployeeRecipientFilter } from "@/lib/employees";

export async function createCampaign() {
  const session = await getSession();
  requirePermission(session, "manage_campaigns");

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("marketing_email_campaigns")
    .insert({ name: "Untitled campaign", created_by: session?.userId ?? null })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create campaign: ${error.message}`);
  }

  redirect(`/campaigns/${data.id}/edit`);
}

export type SaveCampaignDraftInput = {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  html_content: string;
  unlayer_design_json: unknown;
  recipient_filter: EmployeeRecipientFilter;
  event_id: string | null;
  individual_recipient_emails: string[] | null;
  sendgrid_suppression_group_id: number | null;
};

export async function saveCampaignDraft(input: SaveCampaignDraftInput) {
  const session = await getSession();
  requirePermission(session, "manage_campaigns");

  const supabase = createServiceRoleClient();

  // The send route builds a SendGrid list lazily and reuses it across
  // retries (so a slow SendGrid import doesn't spawn a duplicate list on
  // every retry -- see [id]/send/route.ts). That reuse is only valid while
  // the recipient selection hasn't changed since the list was built, so
  // clear the in-progress list whenever this save actually changes who the
  // campaign targets. Resend drafts are exempt -- their list is fixed at
  // creation and never rebuilt.
  const { data: current } = await supabase
    .from("marketing_email_campaigns")
    .select("resend_of_campaign_id, recipient_filter, event_id, individual_recipient_emails")
    .eq("id", input.id)
    .maybeSingle();

  const recipientsChanged =
    !current?.resend_of_campaign_id &&
    (JSON.stringify(current?.recipient_filter ?? null) !== JSON.stringify(input.recipient_filter) ||
      current?.event_id !== input.event_id ||
      JSON.stringify(current?.individual_recipient_emails ?? null) !==
        JSON.stringify(input.individual_recipient_emails));

  const { error } = await supabase
    .from("marketing_email_campaigns")
    .update({
      name: input.name,
      subject: input.subject,
      from_name: input.from_name,
      from_email: input.from_email,
      html_content: input.html_content,
      unlayer_design_json: input.unlayer_design_json,
      recipient_filter: input.recipient_filter,
      event_id: input.event_id,
      individual_recipient_emails: input.individual_recipient_emails,
      sendgrid_suppression_group_id: input.sendgrid_suppression_group_id,
      updated_at: new Date().toISOString(),
      ...(recipientsChanged ? { sendgrid_list_ids: [] } : {}),
    })
    .eq("id", input.id)
    .eq("status", "draft");

  if (error) {
    throw new Error(`Failed to save draft: ${error.message}`);
  }

  revalidatePath(`/campaigns/${input.id}/edit`);
  revalidatePath("/campaigns");
}

export async function deleteCampaign(id: string) {
  const session = await getSession();
  requirePermission(session, "manage_campaigns");

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("marketing_email_campaigns").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete campaign: ${error.message}`);
  }

  revalidatePath("/campaigns");
}
