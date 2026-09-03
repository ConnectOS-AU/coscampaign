import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission, type PermissionKey } from "@/lib/auth/permissions";
import { UsersManager } from "./users-manager";
import { EntraGroupsManager } from "./entra-groups-manager";

export default async function UsersPage() {
  const session = await getSession();

  if (!session || !hasPermission(session, "manage_users")) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">
          You don&apos;t have access to user management. Ask someone with that permission to grant you access.
        </p>
      </div>
    );
  }

  const supabase = createServiceRoleClient();
  const [{ data: users }, { data: permissions }, { data: grants }, { data: groupGrants }] = await Promise.all([
    supabase.from("app_users").select("id, email, created_at, entra_object_id").order("email"),
    supabase.from("app_permissions").select("key, description").order("key"),
    supabase.from("app_user_permissions").select("user_id, permission_key"),
    supabase
      .from("entra_group_permissions")
      .select("entra_group_id, entra_group_name, permission_key")
      .returns<{ entra_group_id: string; entra_group_name: string; permission_key: string }[]>(),
  ]);

  const permissionsByUser = new Map<string, PermissionKey[]>();
  for (const g of grants ?? []) {
    const list = permissionsByUser.get(g.user_id) ?? [];
    list.push(g.permission_key as PermissionKey);
    permissionsByUser.set(g.user_id, list);
  }

  const rows = (users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    createdAt: u.created_at,
    permissions: permissionsByUser.get(u.id) ?? [],
    isSso: u.entra_object_id !== null,
  }));

  const groupsById = new Map<string, { groupId: string; groupName: string; permissions: PermissionKey[] }>();
  for (const g of groupGrants ?? []) {
    const entry = groupsById.get(g.entra_group_id) ?? {
      groupId: g.entra_group_id,
      groupName: g.entra_group_name,
      permissions: [],
    };
    entry.permissions.push(g.permission_key as PermissionKey);
    groupsById.set(g.entra_group_id, entry);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Users</h1>
        <p className="text-sm text-neutral-500">Add and manage who can sign in to COSCampaign.</p>
      </div>
      <UsersManager
        initialUsers={rows}
        allPermissions={(permissions ?? []) as { key: PermissionKey; description: string }[]}
        currentUserId={session.userId}
      />

      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Entra ID groups</h2>
        <p className="text-sm text-neutral-500">
          Permissions granted to a group here apply to anyone who signs in via &quot;Sign in with Microsoft&quot;
          and belongs to that group in Entra ID -- separate from the per-user permissions above, which only
          apply to local email/password logins.
        </p>
      </div>
      <EntraGroupsManager
        initialGroups={[...groupsById.values()]}
        allPermissions={(permissions ?? []) as { key: PermissionKey; description: string }[]}
      />
    </div>
  );
}
