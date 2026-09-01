import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    answers?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const answers: unknown[] = Array.isArray(body.answers) ? body.answers : [];

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: survey } = await supabase.from("marketing_email_surveys").select("id").eq("id", id).maybeSingle();
  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  const { data: response, error: responseError } = await supabase
    .from("marketing_email_survey_responses")
    .insert({ survey_id: id, contact_email: email })
    .select("id")
    .single();

  if (responseError) {
    if (responseError.code === "23505") {
      return NextResponse.json({ error: "You've already responded to this survey" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to record response" }, { status: 500 });
  }

  const rows = answers
    .filter((a): a is { question_id: string; answer_text: string } => {
      return typeof a === "object" && a !== null && typeof (a as { question_id?: unknown }).question_id === "string";
    })
    .map((a) => ({
      response_id: response.id,
      question_id: a.question_id,
      answer_text: typeof a.answer_text === "string" ? a.answer_text : "",
    }));

  if (rows.length > 0) {
    const { error: answersError } = await supabase.from("marketing_email_survey_answers").insert(rows);
    if (answersError) {
      return NextResponse.json({ error: "Response recorded, but failed to save some answers" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
