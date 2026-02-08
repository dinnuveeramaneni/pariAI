import Link from "next/link";
import type { PropsWithChildren } from "react";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export async function AppShell({ children }: PropsWithChildren) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="relative flex w-full items-center justify-between px-8 py-3">
          <div className="flex items-center gap-6">
            {session?.user?.id ? (
              <nav className="flex items-center gap-6 text-sm text-slate-600">
                <Link href="/projects" className="hover:text-slate-900">
                  Projects
                </Link>
                <Link
                  href="/"
                  className="font-semibold tracking-wide text-slate-900"
                >
                  Workspace
                </Link>
              </nav>
            ) : (
              <Link
                href="/"
                className="text-sm font-semibold tracking-wide text-slate-900"
              >
                Workspace
              </Link>
            )}
          </div>
          <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-lg font-semibold tracking-wide text-slate-700">
            PariAI
          </p>
          <div className="flex items-center gap-4">
            {session?.user?.id ? (
              <span className="text-xs text-slate-500">Dinakar</span>
            ) : null}
            {session?.user?.id ? <SignOutButton /> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
