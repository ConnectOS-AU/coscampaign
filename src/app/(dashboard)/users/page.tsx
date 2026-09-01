import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/admin";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const supabase = await createClient();
  const admin = await isCurrentUserAdmin(supabase);

  if (!admin) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">
          You don&apos;t have access to user management. Ask an existing admin to grant you access.
        </p>
      </div>
    );
  }

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const serviceClient = createServiceRoleClient();
  const [{ data: userList }, { data: adminRows }] = await Promise.all([
    serviceClient.auth.admin.listUsers({ perPage: 200 }),
    supabase.from("marketing_email_admins").select("user_id"),
  ]);

  const adminIds = new Set((adminRows ?? []).map((r) => r.user_id));
  const users = (userList?.users ?? [])
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(no email)",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      isAdmin: adminIds.has(u.id),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Users</h1>
        <p className="text-sm text-neutral-500">Add and manage who can sign in to COSCampaign.</p>
      </div>
      <UsersManager initialUsers={users} currentUserId={currentUser?.id ?? ""} />
    </div>
  );
}
