import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/format-date";
import type { Survey, SurveyQuestion, SurveyAnswer, SurveyResponse } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "manage_surveys")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const [{ data: survey }, { data: questions }, { data: responses }] = await Promise.all([
    supabase.from("marketing_email_surveys").select("name").eq("id", id).single<Pick<Survey, "name">>(),
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

  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  const responseIds = (responses ?? []).map((r) => r.id);
  const { data: answers } = responseIds.length
    ? await supabase
        .from("marketing_email_survey_answers")
        .select("*")
        .in("response_id", responseIds)
        .returns<SurveyAnswer[]>()
    : { data: [] as SurveyAnswer[] };

  const answersByResponse = new Map<string, Map<string, string>>();
  for (const a of answers ?? []) {
    const byQuestion = answersByResponse.get(a.response_id) ?? new Map<string, string>();
    byQuestion.set(a.question_id, a.answer_text ?? "");
    answersByResponse.set(a.response_id, byQuestion);
  }

  const questionColumns = (questions ?? []).map((q) => ({ key: `q_${q.id}`, label: q.question_text }));
  const columns = [
    { key: "contact_email", label: "Email" },
    { key: "submitted_at", label: "Submitted At" },
    ...questionColumns,
  ];

  const rows = (responses ?? []).map((r) => {
    const row: Record<string, unknown> = {
      contact_email: r.contact_email,
      submitted_at: formatDateTime(r.submitted_at),
    };
    for (const q of questionColumns) {
      row[q.key] = answersByResponse.get(r.id)?.get(q.key.replace(/^q_/, "")) ?? "";
    }
    return row;
  });

  return csvResponse(toCsv(rows, columns), `${survey.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-responses.csv`);
}
