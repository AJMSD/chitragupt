export default function FilesPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Files</h2>
        <p className="mt-2 text-sm text-slate-400">
          Browse allowlisted roots and download files securely.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
        No file roots configured yet.
      </div>
    </section>
  );
}
