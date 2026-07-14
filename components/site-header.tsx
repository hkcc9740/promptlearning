import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "@/app/actions/auth";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-line">
      <div className="wrap flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white font-mono text-sm font-bold"
          >
            /
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Prompt&nbsp;Learning
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/courses"
            className="hidden sm:inline-block px-3 py-2 text-sm text-ink-2 hover:text-ink transition-colors"
          >
            Courses
          </Link>
          <Link
            href="/about"
            className="hidden sm:inline-block px-3 py-2 text-sm text-ink-2 hover:text-ink transition-colors"
          >
            About
          </Link>

          {user ? (
            <form action={signOutAction} className="flex items-center gap-2 pl-1 sm:pl-2">
              <span className="hidden sm:flex items-center gap-2 text-sm text-ink-2">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white text-xs font-semibold"
                >
                  {(user.name ?? "L").slice(0, 1).toUpperCase()}
                </span>
              </span>
              <button type="submit" className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/signin" className="btn btn-dark btn-sm">
              Get started
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
