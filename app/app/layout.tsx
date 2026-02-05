import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  IconFolder,
  IconGrid,
  IconServer,
  IconTerminal,
} from "@/app/components/icons";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import PrivateHeader from "@/app/app/private-header";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#080503] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 h-72 w-72 rounded-full bg-orange-500/25 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-300/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(249,115,22,0.18),_transparent_60%)]" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <PrivateHeader />

        <nav className="flex flex-wrap gap-3">
          <Link
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/20 bg-[#120c08]/70 text-amber-100 transition hover:border-orange-400/60 hover:bg-orange-400/10"
            href="/app"
            aria-label="Dashboard"
            title="Dashboard"
          >
            <IconGrid className="h-5 w-5" />
            <span className="sr-only">Dashboard</span>
          </Link>
          <Link
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/20 bg-[#120c08]/70 text-amber-100 transition hover:border-orange-400/60 hover:bg-orange-400/10"
            href="/app/services"
            aria-label="Services"
            title="Services"
          >
            <IconServer className="h-5 w-5" />
            <span className="sr-only">Services</span>
          </Link>
          <Link
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/20 bg-[#120c08]/70 text-amber-100 transition hover:border-orange-400/60 hover:bg-orange-400/10"
            href="/app/files"
            aria-label="Files"
            title="Files"
          >
            <IconFolder className="h-5 w-5" />
            <span className="sr-only">Files</span>
          </Link>
          <Link
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/20 bg-[#120c08]/70 text-amber-100 transition hover:border-orange-400/60 hover:bg-orange-400/10"
            href="/app/logs"
            aria-label="Logs"
            title="Logs"
          >
            <IconTerminal className="h-5 w-5" />
            <span className="sr-only">Logs</span>
          </Link>
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
