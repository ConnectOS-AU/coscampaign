import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Survey } from "@/lib/types";
import { createSurvey } from "./actions";
import { DeleteSurveyButton } from "./delete-survey-button";

export default async function SurveysPage() {
  const session = await getSession();

  if (!hasPermission(session, "manage_surveys")) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">You don&apos;t have access to surveys.</p>
      </div>
    );
  }

  const supabase = createServiceRoleClient();
  const { data: surveys } = await supabase
    .from("marketing_email_surveys")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<Survey[]>();

  const surveyIds = (surveys ?? []).map((s) => s.id);
  const { data: responseCounts } = surveyIds.length
    ? await supabase.from("marketing_email_survey_responses").select("survey_id").in("survey_id", surveyIds)
    : { data: [] as { survey_id: string }[] };

  const countBySurvey = new Map<string, number>();
  for (const r of responseCounts ?? []) {
    countBySurvey.set(r.survey_id, (countBySurvey.get(r.survey_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Surveys</h1>
          <p className="text-sm text-neutral-500">Built-in surveys and employee feedback forms.</p>
        </div>
        <form action={createSurvey}>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New survey
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Responses</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(surveys ?? []).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">
                  <Link href={`/surveys/${s.id}/edit`} className="font-medium text-neutral-900 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  <Link href={`/surveys/${s.id}/results`} className="hover:underline">
                    {countBySurvey.get(s.id) ?? 0}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-500">{new Date(s.updated_at).toLocaleString("en-AU")}</td>
                <td className="px-4 py-3 text-right">
                  <DeleteSurveyButton id={s.id} />
                </td>
              </tr>
            ))}
            {(surveys ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  No surveys yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
