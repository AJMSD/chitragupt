import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSafeRedirectPath,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  const rawNext = Array.isArray(searchParams?.next)
    ? searchParams?.next?.[0]
    : searchParams?.next;
  const safeNext = getSafeRedirectPath(rawNext);

  if (session) {
    redirect(safeNext);
  }

  const rawError = Array.isArray(searchParams?.error)
    ? searchParams?.error?.[0]
    : searchParams?.error;

  const errorMessage =
    rawError === "invalid"
      ? "Incorrect password. Try again."
      : rawError === "config"
      ? "Auth is not configured. Set AUTH_PASSWORD and AUTH_SECRET."
      : null;

  return (
    <div className="min-h-screen bg-[#050607] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_45%),_radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.25),_transparent_45%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-8 px-6 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              ajmsd-ops
            </p>
            <h1 className="text-2xl font-semibold">Private Access</h1>
            <p className="text-sm text-slate-400">
              Enter the owner password to unlock private routes.
            </p>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <form
            className="mt-6 space-y-4"
            action="/api/auth/login"
            method="post"
          >
            <input type="hidden" name="next" value={safeNext} />
            <label className="block text-sm text-slate-300" htmlFor="password">
              Password
            </label>
            <input
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 focus:border-amber-300/70 focus:outline-none"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
            <button
              className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/15 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/25"
              type="submit"
            >
              Unlock Private Area
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            <Link className="hover:text-amber-200" href="/">
              Return to public dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
