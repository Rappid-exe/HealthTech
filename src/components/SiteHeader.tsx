import Link from "next/link";

export function SiteHeader({ action }: { action?: React.ReactNode }) {
  return (
    <header className="no-print sticky top-0 z-10 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Beacon</span>
          <span className="hidden text-xs text-faint sm:inline">
            Pharmacogenomic safety check
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </div>
    </header>
  );
}
