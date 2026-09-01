"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import type { SurveyQuestionType } from "@/lib/types";

export async function createSurvey() {
  const session = await getSession();
  requirePermission(session, "manage_surveys");

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("marketing_email_surveys")
    .insert({ name: "Untitled survey", created_by: session?.userId ?? null })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create survey: ${error.message}`);
  }

  redirect(`/surveys/${data.id}/edit`);
}

export type SaveSurveyQuestionInput = {
  question_text: string;
  question_type: SurveyQuestionType;
  options: string[] | null;
};

export async function saveSurvey(input: {
  id: string;
  name: string;
  description: string;
  questions: SaveSurveyQuestionInput[];
}) {
  const session = await getSession();
  requirePermission(session, "manage_surveys");

  const supabase = createServiceRoleClient();

  const { error: surveyError } = await supabase
    .from("marketing_email_surveys")
    .update({ name: input.name, description: input.description || null, updated_at: new Date().toISOString() })
    .eq("id", input.id);

  if (surveyError) {
    throw new Error(`Failed to save survey: ${surveyError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("marketing_email_survey_questions")
    .delete()
    .eq("survey_id", input.id);

  if (deleteError) {
    throw new Error(`Failed to update questions: ${deleteError.message}`);
  }

  if (input.questions.length > 0) {
    const { error: insertError } = await supabase.from("marketing_email_survey_questions").insert(
      input.questions.map((q, i) => ({
        survey_id: input.id,
        position: i,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.question_type === "multiple_choice" ? q.options : null,
      })),
    );
    if (insertError) {
      throw new Error(`Failed to save questions: ${insertError.message}`);
    }
  }

  revalidatePath(`/surveys/${input.id}/edit`);
  revalidatePath("/surveys");
}

export async function deleteSurvey(id: string) {
  const session = await getSession();
  requirePermission(session, "manage_surveys");

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("marketing_email_surveys").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete survey: ${error.message}`);
  }

  revalidatePath("/surveys");
}
