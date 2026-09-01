"use client";

import { useEffect, useRef, useState } from "react";

export type IndividualRecipient = { name: string; email: string };

export function IndividualRecipientPicker({
  value,
  onChange,
}: {
  value: IndividualRecipient[];
  onChange: (next: IndividualRecipient[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndividualRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/employees/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((body: { results: IndividualRecipient[] }) => setResults(body.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function add(person: IndividualRecipient) {
    if (value.some((p) => p.email === person.email)) return;
    onChange([...value, person]);
  }

  function remove(email: string) {
    onChange(value.filter((p) => p.email !== email));
  }

  const selectedEmails = new Set(value.map((p) => p.email));

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 md:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Recipients (individuals)</h3>
        <span className="text-sm text-neutral-500">{value.length} selected</span>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <span
              key={p.email}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-1 pl-3 pr-1.5 text-xs text-neutral-800"
            >
              {p.name} <span className="text-neutral-400">({p.email})</span>
              <button
                onClick={() => remove(p.email)}
                className="rounded-full px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                aria-label={`Remove ${p.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search employees by name or email..."
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />

      {query.trim().length >= 2 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-200">
          {loading && <p className="px-3 py-2 text-sm text-neutral-500">Searching...</p>}
          {!loading &&
            results.map((r) => (
              <button
                key={r.email}
                onClick={() => add(r)}
                disabled={selectedEmails.has(r.email)}
                className="flex w-full items-center justify-between border-b border-neutral-100 px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-40"
              >
                <span className="truncate">
                  {r.name} <span className="text-neutral-400">({r.email})</span>
                </span>
                {!selectedEmails.has(r.email) && <span className="shrink-0 text-xs text-neutral-400">Add</span>}
              </button>
            ))}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-neutral-500">No matches.</p>
          )}
        </div>
      )}
    </div>
  );
}
