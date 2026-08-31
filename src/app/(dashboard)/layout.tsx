import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link href="/campaigns" className="text-sm font-semibold text-neutral-900">
              Campaigns
            </Link>
            <Link href="/templates" className="text-sm text-neutral-600 hover:text-neutral-900">
              Templates
            </Link>
            <Link href="/images" className="text-sm text-neutral-600 hover:text-neutral-900">
              Images
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
