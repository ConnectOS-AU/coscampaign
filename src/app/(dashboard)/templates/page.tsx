import { createServiceRoleClient } from "@/lib/supabase";
import type { EmailTemplate } from "@/lib/types";
import { createCampaignFromTemplate } from "./actions";
import { DeleteTemplateButton } from "./delete-template-button";

export default async function TemplatesPage() {
  const supabase = createServiceRoleClient();
  const { data: templates } = await supabase
    .from("marketing_email_templates")
    .select("id, name, description, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .returns<Pick<EmailTemplate, "id" | "name" | "description" | "created_at" | "updated_at">[]>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Design templates</h1>
        <p className="text-sm text-neutral-500">
          Reusable email designs (layout, images, and colors) saved from the campaign editor. Pick one below
          to start a new campaign from it, or save a new one with &quot;Save as template&quot; while editing a
          campaign.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(templates ?? []).map((t) => (
          <div key={t.id} className="flex flex-col justify-between rounded-lg border border-neutral-200 bg-white p-4">
            <div>
              <h2 className="font-medium text-neutral-900">{t.name}</h2>
              {t.description && <p className="mt-1 text-sm text-neutral-500">{t.description}</p>}
              <p className="mt-2 text-xs text-neutral-400">
                Updated {new Date(t.updated_at).toLocaleDateString()}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <form action={createCampaignFromTemplate.bind(null, t.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Use template
                </button>
              </form>
              <DeleteTemplateButton id={t.id} />
            </div>
          </div>
        ))}
        {(templates ?? []).length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-neutral-500">
            No templates saved yet. Design a campaign, then use &quot;Save as template&quot; in the editor.
          </p>
        )}
      </div>
    </div>
  );
}
