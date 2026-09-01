"use client";

import { useState } from "react";
import type { SurveyQuestion } from "@/lib/types";

export function SurveyResponseForm({
  surveyId,
  email,
  questions,
}: {
  surveyId: string;
  email: string;
  questions: SurveyQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${surveyId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          answers: questions.map((q) => ({ question_id: q.id, answer_text: answers[q.id] ?? "" })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to submit");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <p className="mt-6 text-sm font-medium text-green-700">Thanks — your response has been recorded.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-800">
            {i + 1}. {q.question_text}
          </label>

          {q.question_type === "text" && (
            <textarea
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          )}

          {q.question_type === "multiple_choice" && (
            <div className="space-y-1">
              {(q.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {q.question_type === "rating" && (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(n) }))}
                  className={`h-9 w-9 rounded-md border text-sm font-medium ${
                    answers[q.id] === String(n)
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || questions.length === 0}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
}
