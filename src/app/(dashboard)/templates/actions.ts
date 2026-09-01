"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";

export async function saveTemplate(input: { name: string; unlayer_design_json: unknown; html_content: string }) {
  const session = await getSession();
  requirePermission(session, "manage_templates");

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("marketing_email_templates")
    .insert({
      name: input.name,
      unlayer_design_json: input.unlayer_design_json,
      html_content: input.html_content,
      created_by: session?.userId ?? null,
    })
    .select("id, name")
    .single();

  if (error) {
    throw new Error(`Failed to save template: ${error.message}`);
  }

  revalidatePath("/templates");
  return data;
}

export async function createCampaignFromTemplate(templateId: string) {
  const session = await getSession();
  requirePermission(session, "manage_campaigns");

  const supabase = createServiceRoleClient();
  const { data: template, error: fetchError } = await supabase
    .from("marketing_email_templates")
    .select("name, unlayer_design_json, html_content")
    .eq("id", templateId)
    .single();

  if (fetchError || !template) {
    throw new Error("Template not found");
  }

  const { data: campaign, error: insertError } = await supabase
    .from("marketing_email_campaigns")
    .insert({
      name: template.name,
      unlayer_design_json: template.unlayer_design_json,
      html_content: template.html_content,
      created_by: session?.userId ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Failed to create campaign from template: ${insertError.message}`);
  }

  redirect(`/campaigns/${campaign.id}/edit`);
}

export async function deleteTemplate(id: string) {
  const session = await getSession();
  requirePermission(session, "manage_templates");

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("marketing_email_templates").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete template: ${error.message}`);
  }
  revalidatePath("/templates");
}
