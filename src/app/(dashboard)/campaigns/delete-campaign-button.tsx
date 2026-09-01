"use client";

import { useState, useTransition } from "react";
import type { Campaign } from "@/lib/types";
import { deleteCampaign } from "./actions";

const WARNINGS: Partial<Record<Campaign["status"], string>> = {
  queued: "Delete? This will cancel the send that's currently being prepared.",
  scheduled: "Delete? This will cancel the scheduled send.",
  sending: "Delete? This permanently removes its send history and stats.",
  sent: "Delete? This permanently removes its send history and stats.",
};

export function DeleteCampaignButton({ id, status }: { id: string; status: Campaign["status"] }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-neutral-500 hover:text-red-600">
        Delete
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-neutral-500">{WARNINGS[status] ?? "Delete?"}</span>
      <button
        disabled={pending}
        onClick={() => startTransition(() => deleteCampaign(id))}
        className="font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        Yes
      </button>
      <button onClick={() => setConfirming(false)} className="text-neutral-500 hover:underline">
        Cancel
      </button>
    </span>
  );
}
