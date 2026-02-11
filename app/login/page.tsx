import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IconArrowRight, IconLock } from "@/app/components/icons";
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
    <div className="min-h-screen bg-[#090605] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 h-72 w-72 rounded-full bg-orange-500/30 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-300/25 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.2),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(249,115,22,0.2),_transparent_60%)]" />
      </div>
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-8 px-6 py-10">
        <div className="w-full max-w-md rounded-[32px] border border-orange-500/25 bg-[#120c08]/80 p-8 shadow-[0_20px_60px_rgba(10,6,4,0.65)]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-amber-200/70">
              CHITRAGUPT
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100">
                <IconLock className="h-5 w-5" />
              </div>
              <h1 className="font-[var(--font-display)] text-2xl text-amber-100">
                Private Access
              </h1>
            </div>
            <p className="text-sm text-amber-100/70">
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
            <label className="block text-xs uppercase tracking-[0.3em] text-amber-200/70" htmlFor="password">
              Password
            </label>
            <input
              className="w-full rounded-2xl border border-orange-500/30 bg-black/40 px-4 py-3 text-sm text-amber-50 focus:border-orange-300/70 focus:outline-none"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
            <button
              className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-orange-400/50 bg-orange-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-orange-300/70 hover:bg-orange-400/20"
              type="submit"
              aria-label="Unlock private area"
              title="Unlock private area"
            >
              <span className="sr-only">Unlock Private Area</span>
              <span className="text-xs uppercase tracking-[0.4em]">Enter</span>
              <IconArrowRight className="h-5 w-5" />
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-amber-200/60">
            <Link className="hover:text-amber-100" href="/">
              Return to public dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
