import { createClient } from "@/lib/supabase/server";
import type { EmailTemplate } from "@/lib/types";
import { DeleteTemplateButton } from "./delete-template-button";

export default async function TemplatesPage() {
  const supabase = await createClient();
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
          Reusable email designs (layout, images, and colors) saved from the campaign editor. Save one with
          &quot;Save as template&quot; while editing a campaign, and load it into a new campaign from there.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(templates ?? []).map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-medium text-neutral-900">{t.name}</td>
                <td className="px-4 py-3 text-neutral-500">{new Date(t.updated_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <DeleteTemplateButton id={t.id} />
                </td>
              </tr>
            ))}
            {(templates ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-500">
                  No templates saved yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
