export default function LogsPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Logs</h2>
        <p className="mt-2 text-sm text-slate-400">
          Tail logs for allowlisted services and containers.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
        No log sources configured yet.
      </div>
    </section>
  );
}
