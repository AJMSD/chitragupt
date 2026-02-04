import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#050607] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.2),_transparent_45%),_radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.2),_transparent_45%)]" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              ajmsd-ops
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Private Operations
            </h1>
            <p className="text-sm text-slate-400">
              Authenticated views for services, files, and logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              className="rounded-full border border-slate-800 px-4 py-2 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
              href="/"
            >
              Public Overview
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 font-semibold text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/20"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <nav className="flex flex-wrap gap-3 text-sm">
          <Link
            className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
            href="/app"
          >
            Dashboard
          </Link>
          <Link
            className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
            href="/app/services"
          >
            Services
          </Link>
          <Link
            className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
            href="/app/files"
          >
            Files
          </Link>
          <Link
            className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
            href="/app/logs"
          >
            Logs
          </Link>
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
