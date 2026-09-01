"use client";

import { useState } from "react";
import type { EventField } from "@/lib/types";

export function EventRegistrationForm({ eventId, fields }: { eventId: string; fields: EventField[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"confirmed" | "waitlisted" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          answers: fields.map((f) => ({ field_id: f.id, answer_text: answers[f.id] ?? "" })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to register");
      setResult(body.status ?? "confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setSubmitting(false);
    }
  }

  if (result === "confirmed") {
    return <p className="mt-6 text-sm font-medium text-green-700">You&apos;re registered — see you there!</p>;
  }
  if (result === "waitlisted") {
    return (
      <p className="mt-6 text-sm font-medium text-amber-700">
        This event is full — you&apos;ve been added to the waitlist. We&apos;ll reach out if a spot opens up.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-800">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-800">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      {fields.map((f) => (
        <div key={f.id} className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-800">
            {f.field_label}
            {f.required && <span className="text-red-600"> *</span>}
          </label>

          {f.field_type === "text" && (
            <textarea
              value={answers[f.id] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
              required={f.required}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          )}

          {f.field_type === "multiple_choice" && (
            <div className="space-y-1">
              {(f.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="radio"
                    name={f.id}
                    value={opt}
                    required={f.required}
                    checked={answers[f.id] === opt}
                    onChange={() => setAnswers((prev) => ({ ...prev, [f.id]: opt }))}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Register"}
      </button>
    </form>
  );
}
