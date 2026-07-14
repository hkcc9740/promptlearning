import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="wrap py-12 flex flex-col sm:flex-row gap-8 sm:items-end sm:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-white font-mono text-xs font-bold"
            >
              /
            </span>
            <span className="text-base font-semibold">Prompt Learning</span>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            One prompt. A real mini-course. Distilled from the people who teach it best —
            then adapted to you by the AI you already use.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Link href="/courses" className="text-ink-2 hover:text-ink w-fit transition-colors">
            Browse courses
          </Link>
          <Link href="/about" className="text-ink-2 hover:text-ink w-fit transition-colors">
            About the curator
          </Link>
        </div>
      </div>
      <div className="border-t border-line/70">
        <div className="wrap py-5 space-y-2">
          <p className="text-xs text-muted leading-relaxed max-w-3xl">
            Courses are independently created and are not affiliated with, endorsed by, or
            sponsored by any institution, firm, or individual named. Names are cited only to
            credit the public teaching each course draws from. All trademarks belong to their
            respective owners.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-between text-xs text-muted font-mono">
            <span>© {new Date().getFullYear()} Prompt Learning</span>
            <span>Made for people who’d rather learn than scroll.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
