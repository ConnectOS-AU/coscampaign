import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

const BUCKET = "campaign-images";

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
  // Also allowed for anyone editing a campaign -- Unlayer's inline "Upload
  // Image" action hits this same endpoint from the editor, not just the
  // dedicated Images library page.
  if (!hasPermission(session, "manage_images") && !hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const name = formData?.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are supported" }, { status: 400 });
  }

  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const storagePath = `${crypto.randomUUID()}${extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
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
