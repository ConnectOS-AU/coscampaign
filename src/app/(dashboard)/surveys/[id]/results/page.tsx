import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Survey, SurveyQuestion, SurveyAnswer, SurveyResponse } from "@/lib/types";

export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
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
  const [{ data: survey, error }, { data: questions }, { data: responses }] = await Promise.all([
    supabase.from("marketing_email_surveys").select("*").eq("id", id).single<Survey>(),
    supabase
      .from("marketing_email_survey_questions")
      .select("*")
      .eq("survey_id", id)
      .order("position")
      .returns<SurveyQuestion[]>(),
    supabase
      .from("marketing_email_survey_responses")
      .select("*")
      .eq("survey_id", id)
      .order("submitted_at", { ascending: false })
      .returns<SurveyResponse[]>(),
  ]);

  if (error || !survey) {
    notFound();
  }

  const responseIds = (responses ?? []).map((r) => r.id);
  const { data: answers } = responseIds.length
    ? await supabase
        .from("marketing_email_survey_answers")
        .select("*")
        .in("response_id", responseIds)
        .returns<SurveyAnswer[]>()
    : { data: [] as SurveyAnswer[] };

  const answersByQuestion = new Map<string, SurveyAnswer[]>();
  for (const a of answers ?? []) {
    const list = answersByQuestion.get(a.question_id) ?? [];
    list.push(a);
    answersByQuestion.set(a.question_id, list);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{survey.name} — Results</h1>
          <p className="text-sm text-neutral-500">{(responses ?? []).length} responses</p>
        </div>
        <a
          href={`/api/surveys/${id}/export`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Export CSV
        </a>
      </div>

      {(questions ?? []).map((q, i) => {
        const qAnswers = answersByQuestion.get(q.id) ?? [];
        return (
          <section key={q.id} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900">
              {i + 1}. {q.question_text}
            </h2>

            {q.question_type === "multiple_choice" && (
              <div className="space-y-2">
                {(q.options ?? []).map((opt) => {
                  const count = qAnswers.filter((a) => a.answer_text === opt).length;
                  const pct = qAnswers.length > 0 ? Math.round((count / qAnswers.length) * 100) : 0;
                  return (
                    <div key={opt} className="space-y-1">
                      <div className="flex justify-between text-sm text-neutral-700">
                        <span>{opt}</span>
                        <span className="text-neutral-500">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full rounded-full bg-neutral-900" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {q.question_type === "rating" && (
              <div>
                <p className="text-2xl font-semibold text-neutral-900">
                  {qAnswers.length > 0
                    ? (qAnswers.reduce((sum, a) => sum + Number(a.answer_text ?? 0), 0) / qAnswers.length).toFixed(1)
                    : "—"}
                  <span className="text-sm font-normal text-neutral-500"> / 5 average</span>
                </p>
                <div className="mt-2 flex gap-4 text-xs text-neutral-500">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n}>
                      {n}★: {qAnswers.filter((a) => a.answer_text === String(n)).length}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {q.question_type === "text" && (
              <div className="space-y-2">
                {qAnswers
                  .filter((a) => a.answer_text)
                  .map((a) => (
                    <p key={a.id} className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                      {a.answer_text}
                    </p>
                  ))}
                {qAnswers.filter((a) => a.answer_text).length === 0 && (
                  <p className="text-sm text-neutral-500">No answers yet.</p>
                )}
              </div>
            )}

            {qAnswers.length === 0 && q.question_type !== "text" && (
              <p className="text-sm text-neutral-500">No answers yet.</p>
            )}
          </section>
        );
      })}

      {(questions ?? []).length === 0 && (
        <p className="text-sm text-neutral-500">This survey has no questions yet.</p>
      )}
    </div>
  );
}
