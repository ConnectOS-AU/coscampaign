"use client";

import { useState, useTransition } from "react";
import { deleteTemplate } from "./actions";

export function DeleteTemplateButton({ id }: { id: string }) {
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
      <span className="text-neutral-500">Delete?</span>
      <button
        disabled={pending}
        onClick={() => startTransition(() => deleteTemplate(id))}
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
