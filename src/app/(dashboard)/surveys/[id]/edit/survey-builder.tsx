"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Survey, SurveyQuestion, SurveyQuestionType } from "@/lib/types";
import { saveSurvey } from "../../actions";

type DraftQuestion = {
  key: string;
  question_text: string;
  question_type: SurveyQuestionType;
  options: string[];
};

function toDraft(q: SurveyQuestion): DraftQuestion {
  return {
    key: q.id,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options ?? [],
  };
}

let localKeyCounter = 0;
function newKey() {
  localKeyCounter += 1;
  return `new-${localKeyCounter}`;
}

export function SurveyBuilder({ survey, initialQuestions }: { survey: Survey; initialQuestions: SurveyQuestion[] }) {
  const router = useRouter();
  const [name, setName] = useState(survey.name);
  const [description, setDescription] = useState(survey.description ?? "");
  const [questions, setQuestions] = useState<DraftQuestion[]>(initialQuestions.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const surveyLink =
    typeof window !== "undefined" ? `${window.location.origin}/s/${survey.id}?email={{email}}` : "";

  function addQuestion() {
    setQuestions((prev) => [...prev, { key: newKey(), question_text: "", question_type: "text", options: [] }]);
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
  }

  function moveQuestion(key: string, direction: -1 | 1) {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function updateOption(key: string, optionIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key ? { ...q, options: q.options.map((o, i) => (i === optionIndex ? value : o)) } : q,
      ),
    );
  }

  function addOption(key: string) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, options: [...q.options, ""] } : q)));
  }

  function removeOption(key: string, optionIndex: number) {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, options: q.options.filter((_, i) => i !== optionIndex) } : q)),
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await saveSurvey({
        id: survey.id,
        name,
        description,
        questions: questions.map((q) => ({
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.question_type === "multiple_choice" ? q.options.filter((o) => o.trim()) : null,
        })),
      });
      setMessage({ type: "success", text: "Saved." });
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(surveyLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-md rounded-md border border-transparent bg-transparent px-1 text-2xl font-semibold text-neutral-900 hover:border-neutral-200 focus:border-neutral-300 focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}

      <div className="space-y-1 rounded-lg border border-neutral-200 bg-white p-4">
        <label className="text-sm font-medium text-neutral-700">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Questions</h2>
          <button
            onClick={addQuestion}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Add question
          </button>
        </div>

        {questions.map((q, i) => (
          <div key={q.key} className="space-y-2 rounded-md border border-neutral-200 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 text-xs text-neutral-400">{i + 1}.</span>
              <input
                value={q.question_text}
                onChange={(e) => updateQuestion(q.key, { question_text: e.target.value })}
                placeholder="Question text"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
              <select
                value={q.question_type}
                onChange={(e) => updateQuestion(q.key, { question_type: e.target.value as SurveyQuestionType })}
                className="rounded-md border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              >
                <option value="text">Text</option>
                <option value="multiple_choice">Multiple choice</option>
                <option value="rating">Rating (1-5)</option>
              </select>
              <button onClick={() => moveQuestion(q.key, -1)} className="px-1 text-neutral-400 hover:text-neutral-900">
                ↑
              </button>
              <button onClick={() => moveQuestion(q.key, 1)} className="px-1 text-neutral-400 hover:text-neutral-900">
                ↓
              </button>
              <button onClick={() => removeQuestion(q.key)} className="px-1 text-xs text-neutral-400 hover:text-red-600">
                Remove
              </button>
            </div>

            {q.question_type === "multiple_choice" && (
              <div className="ml-6 space-y-1.5">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) => updateOption(q.key, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
                    />
                    <button onClick={() => removeOption(q.key, oi)} className="text-xs text-neutral-400 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addOption(q.key)}
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                >
                  + Add option
                </button>
              </div>
            )}
          </div>
        ))}
        {questions.length === 0 && <p className="text-sm text-neutral-500">No questions yet.</p>}
      </div>

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Link to include in a campaign</h2>
        <p className="text-xs text-neutral-500">
          Unlayer doesn&apos;t have a native survey block — paste this link into a button or text block in the
          campaign editor. <code>{"{{email}}"}</code> is SendGrid&apos;s merge tag; it gets replaced with each
          recipient&apos;s real address at send time, the same way read-depth tracking already works, so responses
          come back tied to a person without requiring login.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {surveyLink}
          </code>
          <button
            onClick={handleCopyLink}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
