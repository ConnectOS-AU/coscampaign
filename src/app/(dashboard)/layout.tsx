import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const canManageUsers = hasPermission(session, "manage_users");

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link href="/campaigns" className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={120} height={24} className="h-5 w-auto" priority />
              <span className="text-sm font-semibold text-neutral-900">COSCampaign</span>
            </Link>
            <Link href="/campaigns" className="text-sm text-neutral-600 hover:text-neutral-900">
              Campaigns
            </Link>
            <Link href="/templates" className="text-sm text-neutral-600 hover:text-neutral-900">
              Templates
            </Link>
            <Link href="/images" className="text-sm text-neutral-600 hover:text-neutral-900">
              Images
            </Link>
            {canManageUsers && (
              <Link href="/users" className="text-sm text-neutral-600 hover:text-neutral-900">
                Users
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/security" className="text-sm text-neutral-600 hover:text-neutral-900">
              Security
            </Link>
            <span className="text-sm text-neutral-500">{session.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
