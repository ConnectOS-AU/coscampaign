"use client";

import { useEffect, useRef, useState } from "react";
import type { EmployeeFilterOptions, EmployeeRecipientFilter } from "@/lib/employees";

type FacetKey = Exclude<keyof EmployeeRecipientFilter, "override_all">;

const FACETS: { key: FacetKey; label: string }[] = [
  { key: "client_names", label: "Client" },
  { key: "calendar_names", label: "Calendar" },
  { key: "client_provinces", label: "Client Province" },
  { key: "client_countries", label: "Client Country" },
];

export function EmployeeRecipientPicker({
  value,
  onChange,
  initialOptions,
  onMatchingCountChange,
}: {
  value: EmployeeRecipientFilter;
  onChange: (next: EmployeeRecipientFilter) => void;
  initialOptions: EmployeeFilterOptions;
  onMatchingCountChange?: (count: number) => void;
}) {
  const [options, setOptions] = useState<EmployeeFilterOptions>(initialOptions);
  const [loading, setLoading] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    onMatchingCountChange?.(options.matchingCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.matchingCount]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/employees/filter-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    })
      .then((res) => res.json())
      .then((body: EmployeeFilterOptions) => {
        if (!cancelled) setOptions(body);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function toggle(facet: FacetKey, option: string) {
    const current = value[facet];
    const next = current.includes(option) ? current.filter((v) => v !== option) : [...current, option];
    onChange({ ...value, [facet]: next });
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 md:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Recipients (employees)</h3>
        <span className="text-sm text-neutral-500">
          {loading ? "Updating..." : `${options.matchingCount.toLocaleString()} matching`}
        </span>
      </div>

      <label className="flex items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={value.override_all}
          onChange={(e) => onChange({ ...value, override_all: e.target.checked })}
        />
        Send to all active employees (overrides every filter below)
      </label>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 ${value.override_all ? "opacity-40" : ""}`}>
        {FACETS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium text-neutral-500">
              {label} ({value[key].length} selected)
            </label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-300 p-2">
              {options.options[key].map((opt) => (
                <label key={opt} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={value[key].includes(opt)}
                    disabled={value.override_all}
                    onChange={() => toggle(key, opt)}
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))}
              {options.options[key].length === 0 && (
                <p className="text-xs text-neutral-400">No options for the current filters.</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Client Country/Province reflect where the client the employee works for is based, sourced from active
        employee records (more complete than joining the clients table directly, since not every employee
        record has a matching client row). Selecting more than one value within a filter matches any of them;
        filters across different categories narrow the result together. Recipients are resolved fresh each
        time the campaign sends.
      </p>
    </div>
  );
}
