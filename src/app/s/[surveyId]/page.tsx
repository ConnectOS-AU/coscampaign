import { createServiceRoleClient } from "@/lib/supabase";
import type { Survey, SurveyQuestion } from "@/lib/types";
import { SurveyResponseForm } from "./survey-response-form";

export default async function SurveyResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { surveyId } = await params;
  const { email } = await searchParams;

  const supabase = createServiceRoleClient();
  const [{ data: survey }, { data: questions }] = await Promise.all([
    supabase.from("marketing_email_surveys").select("*").eq("id", surveyId).single<Survey>(),
    supabase
      .from("marketing_email_survey_questions")
      .select("*")
      .eq("survey_id", surveyId)
      .order("position")
      .returns<SurveyQuestion[]>(),
  ]);

  if (!survey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">This survey doesn&apos;t exist or has been removed.</p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">
          This link is missing the information needed to record your response.
        </p>
      </div>
    );
  }

  const { data: existingResponse } = await supabase
    .from("marketing_email_survey_responses")
    .select("id")
    .eq("survey_id", surveyId)
    .eq("contact_email", email)
    .maybeSingle();

  if (existingResponse) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-neutral-900">Thanks — you&apos;ve already responded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">{survey.name}</h1>
        {survey.description && <p className="mt-1 text-sm text-neutral-500">{survey.description}</p>}
        <SurveyResponseForm surveyId={surveyId} email={email} questions={questions ?? []} />
      </div>
    </div>
  );
}
