"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PermissionKey } from "@/lib/auth/permissions";
import { addEntraGroupMapping, deleteEntraGroupMapping, setEntraGroupPermissions } from "./actions";

type GroupRow = { groupId: string; groupName: string; permissions: PermissionKey[] };
type PermissionDef = { key: PermissionKey; description: string };

export function EntraGroupsManager({
  initialGroups,
  allPermissions,
}: {
  initialGroups: GroupRow[];
  allPermissions: PermissionDef[];
}) {
  const router = useRouter();
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [newGroupPermissions, setNewGroupPermissions] = useState<Set<PermissionKey>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addEntraGroupMapping({ groupId, groupName, permissions: [...newGroupPermissions] });
      setGroupId("");
      setGroupName("");
      setNewGroupPermissions(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add group mapping");
    } finally {
      setAdding(false);
    }
  }

  async function handleTogglePermission(group: GroupRow, key: PermissionKey) {
    const next = group.permissions.includes(key)
      ? group.permissions.filter((k) => k !== key)
      : [...group.permissions, key];
    setBusyGroupId(group.groupId);
    setError(null);
    try {
      await setEntraGroupPermissions(group.groupId, group.groupName, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group mapping");
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyGroupId(id);
    setError(null);
    try {
      await deleteEntraGroupMapping(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove group mapping");
    } finally {
      setBusyGroupId(null);
      setConfirmingDelete(null);
    }
  }

  function toggleNewGroupPermission(key: PermissionKey) {
    setNewGroupPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAddGroup} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Add group</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">Entra group Object ID</label>
            <input
              type="text"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-72 rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">Display name</label>
            <input
              type="text"
              required
              placeholder="COSCampaign-ManageCampaigns"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add group"}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Permissions</label>
          <div className="flex flex-wrap gap-4">
            {allPermissions.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-neutral-700" title={p.description}>
                <input
                  type="checkbox"
                  checked={newGroupPermissions.has(p.key)}
                  onChange={() => toggleNewGroupPermission(p.key)}
                />
                {p.key}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Copy the Object ID from the group&apos;s Overview page in the Entra admin center. Anyone who signs in
          via Microsoft and belongs to this group gets the permissions checked below.
        </p>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Group</th>
              <th className="px-4 py-2 font-medium">Permissions</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialGroups.map((g) => (
              <tr key={g.groupId}>
                <td className="px-4 py-2 align-top text-neutral-700">
                  {g.groupName}
                  <div className="font-mono text-xs text-neutral-400">{g.groupId}</div>
                </td>
                <td className="px-4 py-2 align-top">
                  <div className="flex flex-wrap gap-3">
                    {allPermissions.map((p) => (
                      <label key={p.key} className="flex items-center gap-1.5 text-neutral-600" title={p.description}>
                        <input
                          type="checkbox"
                          checked={g.permissions.includes(p.key)}
                          disabled={busyGroupId === g.groupId}
                          onChange={() => handleTogglePermission(g, p.key)}
                        />
                        {p.key}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 align-top text-right">
                  {confirmingDelete === g.groupId ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-neutral-500">Remove?</span>
                      <button
                        disabled={busyGroupId === g.groupId}
                        onClick={() => handleDelete(g.groupId)}
                        className="font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button onClick={() => setConfirmingDelete(null)} className="text-neutral-500 hover:underline">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingDelete(g.groupId)}
                      className="text-xs text-neutral-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {initialGroups.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                  No Entra groups mapped yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
