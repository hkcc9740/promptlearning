import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButtons } from "@/components/sign-in-buttons";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in free to unlock every course prompt.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = next && next.startsWith("/") ? next : "/courses";

  const session = await auth();
  if (session?.user) redirect(redirectTo);

  return (
    <div className="wrap wrap-narrow py-20 sm:py-28">
      <div className="mx-auto max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white font-mono text-sm font-bold"
          >
            /
          </span>
          <span className="text-lg font-semibold">Prompt Learning</span>
        </Link>

        <h1 className="text-3xl sm:text-4xl mb-3">One sign-in. Every course.</h1>
        <p className="text-ink-2 mb-8 leading-relaxed">
          It’s free — no card, no catch. Signing in just unlocks the full prompt for every
          course so you can copy it into your AI.
        </p>

        <div className="card p-6 text-left">
          <SignInButtons redirectTo={redirectTo} />
        </div>

        <p className="mt-6 text-xs text-muted leading-relaxed">
          By continuing you agree to be a nicer, slightly smarter person. That’s the whole
          terms of service.
        </p>
      </div>
    </div>
  );
}
