import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "campaign-images";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: image, error: fetchError } = await supabase
    .from("marketing_email_image_library")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (fetchError || !image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase.from("marketing_email_image_library").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await supabase.storage.from(BUCKET).remove([image.storage_path]);

  return NextResponse.json({ deleted: true });
}
