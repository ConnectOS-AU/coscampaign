"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCampaign() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("marketing_email_campaigns")
    .insert({ name: "Untitled campaign", created_by: user?.id ?? null })
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
  sendgrid_list_ids: string[];
  sendgrid_segment_ids: string[];
  sendgrid_suppression_group_id: number | null;
};

export async function saveCampaignDraft(input: SaveCampaignDraftInput) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("marketing_email_campaigns")
    .update({
      name: input.name,
      subject: input.subject,
      from_name: input.from_name,
      from_email: input.from_email,
      html_content: input.html_content,
      unlayer_design_json: input.unlayer_design_json,
      sendgrid_list_ids: input.sendgrid_list_ids,
      sendgrid_segment_ids: input.sendgrid_segment_ids,
      sendgrid_suppression_group_id: input.sendgrid_suppression_group_id,
      updated_at: new Date().toISOString(),
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_email_campaigns")
    .delete()
    .eq("id", id)
    .eq("status", "draft");

  if (error) {
    throw new Error(`Failed to delete campaign: ${error.message}`);
  }

  revalidatePath("/campaigns");
}
