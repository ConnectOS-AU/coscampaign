"use client";

import { useState } from "react";
import type { EventField } from "@/lib/types";

const YES_NO_OPTIONS = ["Yes", "No"];

type Guest = { name: string; relationship: string };

export function EventRegistrationForm({
  eventId,
  fields,
  accentColor,
  maxTicketsPerPerson,
}: {
  eventId: string;
  fields: EventField[];
  accentColor: string | null;
  maxTicketsPerPerson: number;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cosid, setCosid] = useState("");
  const [ticketCount, setTicketCount] = useState(1);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkboxAnswers, setCheckboxAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: "confirmed" | "waitlisted"; verifiedEmail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTicketCountChange(count: number) {
    setTicketCount(count);
    setGuests((prev) => {
      const guestCount = count - 1;
      if (guestCount <= prev.length) return prev.slice(0, guestCount);
      return [...prev, ...Array.from({ length: guestCount - prev.length }, () => ({ name: "", relationship: "" }))];
    });
  }

  function updateGuest(index: number, field: keyof Guest, value: string) {
    setGuests((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  }

  function toggleCheckbox(fieldId: string, option: string) {
    setCheckboxAnswers((prev) => {
      const current = prev[fieldId] ?? [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [fieldId]: next };
    });
  }

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
          ticketCount,
          guests,
          answers: fields
            .filter((f) => f.field_type !== "section")
            .map((f) => ({
              field_id: f.id,
              answer_text: f.field_type === "checkboxes" ? (checkboxAnswers[f.id] ?? []) : (answers[f.id] ?? ""),
            })),
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
            ? ticketCount > 1
              ? `This event doesn't have room for all ${ticketCount} tickets right now, so you've been added to the waitlist.`
              : "This event is full, so you've been added to the waitlist."
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

      {maxTicketsPerPerson > 1 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-800">Number of tickets</label>
          <select
            value={ticketCount}
            onChange={(e) => handleTicketCountChange(Number(e.target.value))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          >
            {Array.from({ length: maxTicketsPerPerson }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {guests.map((guest, i) => (
        <div key={i} className="space-y-3 rounded-md border border-neutral-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Guest {i + 1}</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-800">Name</label>
            <input
              value={guest.name}
              onChange={(e) => updateGuest(i, "name", e.target.value)}
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-800">Relationship to you</label>
            <input
              value={guest.relationship}
              onChange={(e) => updateGuest(i, "relationship", e.target.value)}
              required
              placeholder="e.g. Spouse, Colleague"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
        </div>
      ))}

      {fields.map((f) => {
        if (f.field_type === "section") {
          return (
            <div key={f.id} className="border-t border-neutral-200 pt-4">
              <h2 className="text-sm font-semibold text-neutral-900">{f.field_label}</h2>
            </div>
          );
        }

        return (
          <div key={f.id} className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-800">
              {f.field_label}
              {f.required && <span className="text-red-600"> *</span>}
            </label>

            {(f.field_type === "short_text" || f.field_type === "email" || f.field_type === "phone") && (
              <input
                type={f.field_type === "email" ? "email" : f.field_type === "phone" ? "tel" : "text"}
                value={answers[f.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                required={f.required}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            )}

            {f.field_type === "number" && (
              <input
                type="number"
                value={answers[f.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                required={f.required}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            )}

            {f.field_type === "date" && (
              <input
                type="date"
                value={answers[f.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                required={f.required}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            )}

            {f.field_type === "paragraph" && (
              <textarea
                value={answers[f.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                required={f.required}
                rows={3}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            )}

            {f.field_type === "dropdown" && (
              <select
                value={answers[f.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                required={f.required}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              >
                <option value="" disabled>
                  Select...
                </option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {(f.field_type === "multiple_choice" || f.field_type === "yes_no") && (
              <div className="space-y-1">
                {(f.field_type === "yes_no" ? YES_NO_OPTIONS : f.options ?? []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="radio"
                      name={f.id}
                      value={opt}
                      required={f.required}
                      checked={answers[f.id] === opt}
                      onChange={() => setAnswers((prev) => ({ ...prev, [f.id]: opt }))}
                      style={accentColor ? { accentColor } : undefined}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {f.field_type === "checkboxes" && (
              <div className="space-y-1">
                {(f.options ?? []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={(checkboxAnswers[f.id] ?? []).includes(opt)}
                      onChange={() => toggleCheckbox(f.id, opt)}
                      style={accentColor ? { accentColor } : undefined}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className={`w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
          accentColor ? "hover:opacity-90" : "bg-neutral-900 hover:bg-neutral-800"
        }`}
      >
        {submitting ? "Submitting..." : "Register"}
      </button>
    </form>
  );
}
