"use client";

import { useRef, useState } from "react";
import type { LibraryImage } from "@/lib/types";

export function ImageLibraryManager({ initialImages }: { initialImages: LibraryImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", nameInputRef.current?.value ?? "");

      const res = await fetch("/api/images", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      setImages((prev) => [body.image, ...prev]);
      if (nameInputRef.current) nameInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
    const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete image");
      setImages(initialImages);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleUpload}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Name</label>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="e.g. Company logo"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Image file</label>
          <div className="flex items-center gap-2">
            <label
              htmlFor="image-file-input"
              className="cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Choose file
            </label>
            <input
              id="image-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name ?? null)}
            />
            <span className="text-sm text-neutral-500">{selectedFileName ?? "No file chosen"}</span>
          </div>
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {images.map((img) => (
          <div key={img.id} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.public_url} alt={img.name} className="aspect-square w-full rounded object-cover" />
            <p className="truncate text-xs text-neutral-700" title={img.name}>
              {img.name}
            </p>
            <button
              onClick={() => handleDelete(img.id)}
              className="w-full rounded-md border border-neutral-200 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        ))}
        {images.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-neutral-500">
            No images yet. Upload one above.
          </p>
        )}
      </div>
    </div>
  );
}
