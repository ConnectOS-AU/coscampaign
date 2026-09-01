"use client";

import { useState } from "react";
import type { EventField } from "@/lib/types";

export function EventRegistrationForm({ eventId, fields }: { eventId: string; fields: EventField[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cosid, setCosid] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: "confirmed" | "waitlisted"; verifiedEmail: string } | null>(null);
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
          cosid,
          answers: fields.map((f) => ({ field_id: f.id, answer_text: answers[f.id] ?? "" })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to register");
      setResult({ status: body.status ?? "confirmed", verifiedEmail: body.verifiedEmail ?? email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium text-neutral-900">
          {result.status === "waitlisted"
            ? "This event is full, so you've been added to the waitlist."
            : "Almost there!"}
        </p>
        <p className="text-sm text-neutral-600">
          We sent a confirmation link to <strong>{result.verifiedEmail}</strong> (the address on file for your
          COSID). Click it within 72 hours to confirm your registration, or it will be automatically cancelled.
        </p>
      </div>
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
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-800">Employee ID (COSID)</label>
        <input
          value={cosid}
          onChange={(e) => setCosid(e.target.value)}
          required
          placeholder="COS0000"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <p className="text-xs text-neutral-500">
          Used to verify it&apos;s really you — your confirmation link goes to the email on file for this ID.
        </p>
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
