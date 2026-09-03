"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelSendButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!window.confirm("Cancel this send? It goes back to a draft and won't send until you send it again.")) {
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Cancel failed (${res.status})`);
      router.push(`/campaigns/${campaignId}/edit`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel send");
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {cancelling ? "Cancelling..." : "Cancel send"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
