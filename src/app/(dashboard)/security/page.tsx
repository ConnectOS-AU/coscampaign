"use client";

import { useEffect, useState } from "react";

type Enrolling = { factorId: string; qrCodeDataUrl: string; secret: string };

export default function SecurityPage() {
  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Security</h1>
        <p className="text-sm text-neutral-500">Manage your password and two-factor authentication.</p>
      </div>
      <ChangePassword />
      <TwoFactor />
    </div>
  );
}

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to change password");
      setMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Change password</h2>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Current password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}

function TwoFactor() {
  const [loading, setLoading] = useState(true);
  const [verifiedFactor, setVerifiedFactor] = useState(false);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshStatus() {
    setLoading(true);
    const res = await fetch("/api/auth/mfa/status");
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setVerifiedFactor(Boolean(body.enabled));
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refreshStatus();
  }, []);

  async function handleEnable() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to start enrollment");
      setEnrolling(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelEnroll() {
    setEnrolling(null);
    setCode("");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: enrolling.factorId, code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Invalid code — try again");
      setEnrolling(null);
      setCode("");
      setMessage("Two-factor authentication is now enabled.");
      setVerifiedFactor(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code — try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!window.confirm("Disable two-factor authentication for your account?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to disable 2FA");
      setMessage("Two-factor authentication disabled.");
      setVerifiedFactor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-neutral-900">Two-factor authentication</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : enrolling ? (
        <form onSubmit={handleVerify} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-700">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), or
            enter the secret manually.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimizable asset */}
          <img src={enrolling.qrCodeDataUrl} alt="Authenticator QR code" className="mx-auto h-48 w-48" />
          <p className="break-all rounded-md bg-neutral-50 px-3 py-2 text-center font-mono text-xs text-neutral-600">
            {enrolling.secret}
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">6-digit code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoFocus
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelEnroll}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Verify and enable
            </button>
          </div>
        </form>
      ) : verifiedFactor ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium text-neutral-900">Two-factor authentication is enabled</p>
            <p className="text-sm text-neutral-500">You&apos;ll be asked for a code from your app when you sign in.</p>
          </div>
          <button
            onClick={handleDisable}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            Disable
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium text-neutral-900">Two-factor authentication is off</p>
            <p className="text-sm text-neutral-500">Add an authenticator app for an extra layer of security.</p>
          </div>
          <button
            onClick={handleEnable}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Enable 2FA
          </button>
        </div>
      )}
    </div>
  );
}
