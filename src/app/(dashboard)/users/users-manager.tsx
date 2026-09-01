"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addUser, deleteUser, setAdmin, setUserPassword } from "./actions";

type UserRow = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
};

function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 14);
}

export function UsersManager({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [makeAdmin, setMakeAdmin] = useState(false);
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
      await addUser({ email, password, makeAdmin });
      setLastCreated({ email, password });
      setEmail("");
      setPassword(generatePassword());
      setMakeAdmin(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleAdmin(userId: string, next: boolean) {
    setBusyUserId(userId);
    setError(null);
    try {
      await setAdmin(userId, next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update admin access");
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
          <label className="flex items-center gap-2 pb-2 text-sm text-neutral-700">
            <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
            Admin
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add user"}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Share this password with the user directly (Slack, in person) — email delivery isn&apos;t configured,
          so there&apos;s no automatic invite email. They can change it after signing in.
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
              <th className="px-4 py-2 font-medium">Admin</th>
              <th className="px-4 py-2 font-medium">Last sign in</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 text-neutral-700">
                  {u.email}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-neutral-400">(you)</span>}
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-2 text-neutral-600">
                    <input
                      type="checkbox"
                      checked={u.isAdmin}
                      disabled={busyUserId === u.id || u.id === currentUserId}
                      onChange={(e) => handleToggleAdmin(u.id, e.target.checked)}
                    />
                    {u.isAdmin ? "Admin" : "—"}
                  </label>
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-2 text-right">
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
