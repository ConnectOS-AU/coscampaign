"use client";

import Link from "next/link";
import type { LibraryImage } from "@/lib/types";

type Props = {
  images: LibraryImage[];
  onSelect: (url: string) => void;
  onClose: () => void;
};

export function ImagePickerModal({ images, onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-900">Image library</h3>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-900">
            Close
          </button>
        </div>

        {images.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No images in the library yet. Add standard images from the{" "}
            <Link href="/images" className="underline">
              Images
            </Link>{" "}
            page, or use &quot;Upload Image&quot; on an image block instead.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => onSelect(img.public_url)}
                className="space-y-1 rounded-lg border border-neutral-200 p-2 text-left hover:border-neutral-400"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.public_url} alt={img.name} className="aspect-square w-full rounded object-cover" />
                <p className="truncate text-xs text-neutral-700" title={img.name}>
                  {img.name}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
