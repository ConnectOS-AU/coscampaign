"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PermissionKey } from "@/lib/auth/permissions";
import { addUser, deleteUser, setUserPermissions, setUserPassword } from "./actions";

type UserRow = {
  id: string;
  email: string;
  createdAt: string;
  permissions: PermissionKey[];
};

type PermissionDef = { key: PermissionKey; description: string };

function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 14);
}

export function UsersManager({
  initialUsers,
  allPermissions,
  currentUserId,
}: {
  initialUsers: UserRow[];
  allPermissions: PermissionDef[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [newUserPermissions, setNewUserPermissions] = useState<Set<PermissionKey>>(
    new Set(["manage_campaigns", "manage_templates", "manage_images"]),
  );
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addUser({ email, password, permissions: [...newUserPermissions] });
      setLastCreated({ email, password });
      setEmail("");
      setPassword(generatePassword());
      setNewUserPermissions(new Set(["manage_campaigns", "manage_templates", "manage_images"]));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setAdding(false);
    }
  }

  async function handleTogglePermission(userId: string, current: PermissionKey[], key: PermissionKey) {
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setBusyUserId(userId);
    setError(null);
    try {
      await setUserPermissions(userId, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update permissions");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleResetPassword(userId: string) {
    const newPassword = window.prompt("New temporary password (min 8 characters):", generatePassword());
    if (!newPassword) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await setUserPassword(userId, newPassword);
      window.alert(`Password updated. Share it with the user:\n\n${newPassword}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDelete(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      await deleteUser(userId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setBusyUserId(null);
      setConfirmingDelete(null);
    }
  }

  function toggleNewUserPermission(key: PermissionKey) {
    setNewUserPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAddUser} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Add user</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">Temporary password</label>
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add user"}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Permissions</label>
          <div className="flex flex-wrap gap-4">
            {allPermissions.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-neutral-700" title={p.description}>
                <input
                  type="checkbox"
                  checked={newUserPermissions.has(p.key)}
                  onChange={() => toggleNewUserPermission(p.key)}
                />
                {p.key}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Share this password with the user directly (Slack, in person) — there&apos;s no automatic invite
          email. They can change it after signing in.
        </p>
        {lastCreated && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Created {lastCreated.email} — password: <span className="font-mono">{lastCreated.password}</span>
          </p>
        )}
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Permissions</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 align-top text-neutral-700">
                  {u.email}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-neutral-400">(you)</span>}
                </td>
                <td className="px-4 py-2 align-top">
                  <div className="flex flex-wrap gap-3">
                    {allPermissions.map((p) => (
                      <label key={p.key} className="flex items-center gap-1.5 text-neutral-600" title={p.description}>
                        <input
                          type="checkbox"
                          checked={u.permissions.includes(p.key)}
                          disabled={busyUserId === u.id}
                          onChange={() => handleTogglePermission(u.id, u.permissions, p.key)}
                        />
                        {p.key}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 align-top text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      disabled={busyUserId === u.id}
                      onClick={() => handleResetPassword(u.id)}
                      className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
                    >
                      Reset password
                    </button>
                    {u.id === currentUserId ? null : confirmingDelete === u.id ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <span className="text-neutral-500">Delete?</span>
                        <button
                          disabled={busyUserId === u.id}
                          onClick={() => handleDelete(u.id)}
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
                        onClick={() => setConfirmingDelete(u.id)}
                        className="text-xs text-neutral-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
