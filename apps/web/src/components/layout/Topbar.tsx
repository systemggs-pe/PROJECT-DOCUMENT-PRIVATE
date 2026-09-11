import { ShieldCheck } from "lucide-react";

export function Topbar() {
  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface-elevated)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm text-[var(--muted)]">GGS Document Studio</p>
          <h1 className="text-xl font-semibold tracking-normal">Base operativa</h1>
        </div>
        <div className="hidden items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] sm:flex">
          <ShieldCheck className="size-4 text-[var(--success)]" aria-hidden={true} />
          <span>Metadatos por API</span>
        </div>
      </div>
    </header>
  );
}
