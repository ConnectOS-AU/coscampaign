"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Recipient = { email: string; delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean };

type Props = {
  campaignId: string;
  recipients: Recipient[];
  notOpened: string[];
  notReceived: string[];
};

const VISIBLE_ROWS_LIMIT = 300;

export function ResendPanel({ campaignId, recipients, notOpened, notReceived }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = (r: Recipient) => {
    if (r.bounced) return "bounced";
    if (r.clicked) return "clicked";
    if (r.opened) return "opened";
    if (r.delivered) return "delivered, not opened";
    return "not received";
  };

  const sortedRecipients = useMemo(
    () => [...recipients].sort((a, b) => a.email.localeCompare(b.email)),
    [recipients],
  );

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function selectPreset(emails: string[]) {
    setSelected(new Set(emails));
  }

  async function handleResend() {
    if (selected.size === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: [...selected] }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(responseBody.error ?? `Resend failed (${res.status})`);
      }
      router.push(`/campaigns/${responseBody.campaignId}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare resend");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        Resend...
      </button>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Resend to select recipients</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:text-neutral-900">
          Close
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Creates a new draft campaign with the same content, targeted at a fresh SendGrid list containing only
        the recipients you pick below. You&apos;ll land on the editor to review (and tweak the subject, e.g.
        &quot;Reminder: ...&quot;) before it actually sends.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => selectPreset(notOpened)}
          disabled={notOpened.length === 0}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          Select not opened ({notOpened.length})
        </button>
        <button
          onClick={() => selectPreset(notReceived)}
          disabled={notReceived.length === 0}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          Select not received ({notReceived.length})
        </button>
        <button
          onClick={() => selectPreset(recipients.map((r) => r.email))}
          disabled={recipients.length === 0}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          Select all ({recipients.length})
        </button>
        <button
          onClick={() => setSelected(new Set())}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Clear
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200">
        {sortedRecipients.slice(0, VISIBLE_ROWS_LIMIT).map((r) => (
          <label key={r.email} className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-1.5 text-sm last:border-b-0">
            <span className="flex items-center gap-2 truncate">
              <input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} />
              <span className="truncate">{r.email}</span>
            </span>
            <span className="shrink-0 text-xs text-neutral-400">{statusLabel(r)}</span>
          </label>
        ))}
        {sortedRecipients.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-neutral-500">
            No recipient activity recorded yet for this campaign.
          </p>
        )}
        {sortedRecipients.length > VISIBLE_ROWS_LIMIT && (
          <p className="px-3 py-2 text-center text-xs text-neutral-400">
            Showing first {VISIBLE_ROWS_LIMIT} of {sortedRecipients.length} — use the preset buttons above to
            select beyond what&apos;s listed.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-500">{selected.size} selected</span>
        <button
          onClick={handleResend}
          disabled={sending || selected.size === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {sending ? "Preparing..." : `Create resend draft (${selected.size})`}
        </button>
      </div>
    </div>
  );
}
