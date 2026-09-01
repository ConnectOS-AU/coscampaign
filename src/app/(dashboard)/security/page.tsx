"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; status: "verified" | "unverified" };

export default function SecurityPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [verifiedFactor, setVerifiedFactor] = useState<Factor | null>(null);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshFactors() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Clean up factors left behind by an abandoned enrollment (e.g. the user
    // closed the tab mid-setup) -- they're unusable and otherwise block a
    // fresh "Enable 2FA" attempt with a "friendly name already exists" error.
    const abandoned = data.totp.filter((f) => f.status !== "verified");
    if (abandoned.length > 0) {
      const results = await Promise.all(abandoned.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        setError(`Couldn't clear a previous incomplete 2FA setup: ${failed.error.message}`);
      }
    }

    const totp = data.totp.find((f) => f.status === "verified");
    setVerifiedFactor(totp ? { id: totp.id, status: "verified" } : null);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refreshFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnable() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelEnroll() {
    if (enrolling) {
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    }
    setEnrolling(null);
    setCode("");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      setEnrolling(null);
      setCode("");
      setMessage("Two-factor authentication is now enabled.");
      await refreshFactors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code — try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!verifiedFactor) return;
    if (!window.confirm("Disable two-factor authentication for your account?")) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
      if (error) throw error;
      setMessage("Two-factor authentication disabled.");
      await refreshFactors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Security</h1>
        <p className="text-sm text-neutral-500">Two-factor authentication for your account.</p>
      </div>

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
          <img src={enrolling.qrCode} alt="Authenticator QR code" className="mx-auto h-48 w-48" />
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
