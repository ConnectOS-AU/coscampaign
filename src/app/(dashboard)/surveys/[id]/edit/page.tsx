import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Survey, SurveyQuestion } from "@/lib/types";
import { SurveyBuilder } from "./survey-builder";

export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!hasPermission(session, "manage_surveys")) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">You don&apos;t have access to surveys.</p>
      </div>
    );
  }

  const supabase = createServiceRoleClient();
  const [{ data: survey, error }, { data: questions }] = await Promise.all([
    supabase.from("marketing_email_surveys").select("*").eq("id", id).single<Survey>(),
    supabase
      .from("marketing_email_survey_questions")
      .select("*")
      .eq("survey_id", id)
      .order("position")
      .returns<SurveyQuestion[]>(),
  ]);

  if (error || !survey) {
    notFound();
  }

  return <SurveyBuilder survey={survey} initialQuestions={questions ?? []} />;
}
