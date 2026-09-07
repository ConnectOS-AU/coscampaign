import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

const BUCKET = "campaign-images";
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

// Detected from actual file bytes, not the browser-reported Content-Type
// (trivially spoofable) or filename extension. SVG is deliberately excluded
// even though it's a valid image format -- it can carry embedded <script>
// content, and these end up at public, unauthenticated storage URLs.
const MAGIC_BYTES: { mimeType: string; extension: string; signature: number[] }[] = [
  { mimeType: "image/png", extension: ".png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", extension: ".jpg", signature: [0xff, 0xd8, 0xff] },
  { mimeType: "image/gif", extension: ".gif", signature: [0x47, 0x49, 0x46, 0x38] },
  // WEBP: "RIFF" .... "WEBP" -- bytes 4-7 are a file-size field, skipped.
  { mimeType: "image/webp", extension: ".webp", signature: [0x52, 0x49, 0x46, 0x46] },
];

async function detectImageType(file: File): Promise<{ mimeType: string; extension: string } | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const candidate of MAGIC_BYTES) {
    if (candidate.signature.every((byte, i) => header[i] === byte)) {
      if (candidate.mimeType === "image/webp") {
        const webpMarker = String.fromCharCode(...header.slice(8, 12));
        if (webpMarker !== "WEBP") continue;
      }
      return { mimeType: candidate.mimeType, extension: candidate.extension };
    }
  }
  return null;
}

export async function GET() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("marketing_email_image_library")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ images: data });
}

export async function POST(request: Request) {
  const session = await getSession();
  // Also allowed for anyone editing a campaign (Unlayer's inline "Upload
  // Image" action hits this same endpoint from the editor, not just the
  // dedicated Images library page) or an event (banner image upload).
  const allowed =
    hasPermission(session, "manage_images") ||
    hasPermission(session, "manage_campaigns") ||
    hasPermission(session, "manage_events");
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const name = formData?.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Images must be 8MB or smaller" }, { status: 400 });
  }

  const detected = await detectImageType(file);
  if (!detected) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, GIF, or WEBP images are supported (checked by file content, not just the name)" },
      { status: 400 },
    );
  }

  const storagePath = `${crypto.randomUUID()}${detected.extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: detected.mimeType,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 502 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: image, error: insertError } = await supabase
    .from("marketing_email_image_library")
    .insert({
      name: typeof name === "string" && name.trim() ? name.trim() : file.name,
      storage_path: storagePath,
      public_url: publicUrl,
      created_by: session?.userId ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: `Failed to save image record: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({ image });
}
