import { createServiceRoleClient } from "@/lib/supabase";
import type { LibraryImage } from "@/lib/types";
import { ImageLibraryManager } from "./image-library-manager";

export default async function ImagesPage() {
  const supabase = createServiceRoleClient();
  const { data: images } = await supabase
    .from("marketing_email_image_library")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<LibraryImage[]>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Image library</h1>
        <p className="text-sm text-neutral-500">
          Standard brand images (logos, banners, footers) available to pick from inside the campaign editor.
        </p>
      </div>
      <ImageLibraryManager initialImages={images ?? []} />
    </div>
  );
}
