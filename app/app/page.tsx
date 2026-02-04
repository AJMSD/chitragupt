export default function PrivateDashboardPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Dashboard Overview</h2>
        <p className="mt-2 text-sm text-slate-400">
          Private metrics will populate here once the services, files, and logs
          endpoints are wired up.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold">Services</h3>
          <p className="mt-2 text-sm text-slate-400">
            Docker containers and systemd units will surface here.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold">Files</h3>
          <p className="mt-2 text-sm text-slate-400">
            Browse allowlisted folders and download files.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold">Logs</h3>
          <p className="mt-2 text-sm text-slate-400">
            Tail logs for Immich, Jellyfin, Minecraft, and Terraria.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold">Access Controls</h3>
          <p className="mt-2 text-sm text-slate-400">
            Session-based auth enforced on every private route.
          </p>
        </div>
      </div>
    </section>
  );
}
