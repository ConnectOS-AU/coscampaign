"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveTemplate(input: { name: string; unlayer_design_json: unknown; html_content: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("marketing_email_templates")
    .insert({
      name: input.name,
      unlayer_design_json: input.unlayer_design_json,
      html_content: input.html_content,
      created_by: user?.id ?? null,
    })
    .select("id, name")
    .single();

  if (error) {
    throw new Error(`Failed to save template: ${error.message}`);
  }

  revalidatePath("/templates");
  return data;
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_email_templates").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete template: ${error.message}`);
  }
  revalidatePath("/templates");
}
