"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event, EventField, EventFieldType, EventInviteMode, EventStatus } from "@/lib/types";
import { generateQrCodeDataUrl } from "@/lib/qrcode";
import { saveEvent, createInviteCampaignForEvent } from "../../actions";

type DraftField = {
  key: string;
  field_label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
};

function toDraft(f: EventField): DraftField {
  return { key: f.id, field_label: f.field_label, field_type: f.field_type, options: f.options ?? [], required: f.required };
}

let localKeyCounter = 0;
function newKey() {
  localKeyCounter += 1;
  return `new-${localKeyCounter}`;
}

function toDatetimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

export function EventEditor({ event, initialFields }: { event: Event; initialFields: EventField[] }) {
  const router = useRouter();
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(event.starts_at));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(event.ends_at));
  const [capacityEnabled, setCapacityEnabled] = useState(event.capacity !== null);
  const [capacity, setCapacity] = useState(event.capacity?.toString() ?? "");
  const [inviteMode, setInviteMode] = useState<EventInviteMode>(event.invite_mode);
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [fields, setFields] = useState<DraftField[]>(initialFields.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Set only after mount (not derived directly from `window` during render)
  // so the server-rendered markup matches the client's first render pass --
  // reading window.location.origin inline here caused a hydration mismatch.
  const [registrationUrl, setRegistrationUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/e/${event.id}`;
    setRegistrationUrl(url);
    generateQrCodeDataUrl(url).then(setQrDataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  function addField() {
    setFields((prev) => [...prev, { key: newKey(), field_label: "", field_type: "text", options: [], required: false }]);
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f.key !== key));
  }

  function moveField(key: string, direction: -1 | 1) {
    setFields((prev) => {
      const index = prev.findIndex((f) => f.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateField(key: string, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function updateOption(key: string, optionIndex: number, value: string) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, options: f.options.map((o, i) => (i === optionIndex ? value : o)) } : f)),
    );
  }

  function addOption(key: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, options: [...f.options, ""] } : f)));
  }

  function removeOption(key: string, optionIndex: number) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, options: f.options.filter((_, i) => i !== optionIndex) } : f)),
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await saveEvent({
        id: event.id,
        name,
        description,
        location,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity: capacityEnabled && capacity ? Number(capacity) : null,
        invite_mode: inviteMode,
        status,
        fields: fields.map((f) => ({
          field_label: f.field_label,
          field_type: f.field_type,
          options: f.field_type === "multiple_choice" ? f.options.filter((o) => o.trim()) : null,
          required: f.required,
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
    await navigator.clipboard.writeText(registrationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCreateInviteCampaign() {
    setCreatingInvite(true);
    setMessage(null);
    try {
      await createInviteCampaignForEvent({ eventId: event.id, origin: window.location.origin });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create invite campaign" });
      setCreatingInvite(false);
    }
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

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="draft">Draft (not public yet)</option>
            <option value="open">Open (accepting registrations)</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Starts</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Ends</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
            <input type="checkbox" checked={capacityEnabled} onChange={(e) => setCapacityEnabled(e.target.checked)} />
            Limit capacity (extra registrations are waitlisted)
          </label>
          {capacityEnabled && (
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Max attendees"
              className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          )}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700">Invite flow</label>
          <div className="flex gap-4 text-sm text-neutral-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={inviteMode === "manual"}
                onChange={() => setInviteMode("manual")}
              />
              Manual — I&apos;ll paste the link/QR into a campaign myself
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={inviteMode === "auto_embed"}
                onChange={() => setInviteMode("auto_embed")}
              />
              Auto-embed — create a draft campaign with the link/QR already in it
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Registration fields</h2>
          <button
            onClick={addField}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Add field
          </button>
        </div>
        <p className="text-xs text-neutral-500">Name and email are always collected. Add any extra fields below.</p>

        {fields.map((f, i) => (
          <div key={f.key} className="space-y-2 rounded-md border border-neutral-200 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 text-xs text-neutral-400">{i + 1}.</span>
              <input
                value={f.field_label}
                onChange={(e) => updateField(f.key, { field_label: e.target.value })}
                placeholder="Field label"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
              <select
                value={f.field_type}
                onChange={(e) => updateField(f.key, { field_type: e.target.value as EventFieldType })}
                className="rounded-md border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              >
                <option value="text">Text</option>
                <option value="multiple_choice">Multiple choice</option>
              </select>
              <label className="mt-2 flex items-center gap-1 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f.key, { required: e.target.checked })}
                />
                Required
              </label>
              <button onClick={() => moveField(f.key, -1)} className="px-1 text-neutral-400 hover:text-neutral-900">
                ↑
              </button>
              <button onClick={() => moveField(f.key, 1)} className="px-1 text-neutral-400 hover:text-neutral-900">
                ↓
              </button>
              <button onClick={() => removeField(f.key)} className="px-1 text-xs text-neutral-400 hover:text-red-600">
                Remove
              </button>
            </div>

            {f.field_type === "multiple_choice" && (
              <div className="ml-6 space-y-1.5">
                {f.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) => updateOption(f.key, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
                    />
                    <button onClick={() => removeOption(f.key, oi)} className="text-xs text-neutral-400 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addOption(f.key)}
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                >
                  + Add option
                </button>
              </div>
            )}
          </div>
        ))}
        {fields.length === 0 && <p className="text-sm text-neutral-500">No extra fields yet.</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Registration link</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {registrationUrl}
          </code>
          <button
            onClick={handleCopyLink}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Registration QR code" className="h-40 w-40" />
        )}

        {inviteMode === "manual" ? (
          <p className="text-xs text-neutral-500">
            Copy the link or save the QR code above and paste it into a campaign (button or image block) in the
            campaign editor.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500">
              Creates a draft campaign with the event details, the registration link, and the QR code already in
              the content — you can still edit it in the campaign editor before sending.
            </p>
            <button
              onClick={handleCreateInviteCampaign}
              disabled={creatingInvite}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              {creatingInvite ? "Creating..." : "Create invite campaign"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
