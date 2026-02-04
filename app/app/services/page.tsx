export default function ServicesPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Services</h2>
        <p className="mt-2 text-sm text-slate-400">
          Docker containers and systemd units will appear here once the private
          API routes are connected.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
        No service data yet.
      </div>
    </section>
  );
}
