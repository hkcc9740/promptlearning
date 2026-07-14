import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "Why Prompt Learning exists and who curates it.",
};

export default function AboutPage() {
  return (
    <div className="wrap wrap-narrow py-16 sm:py-20">
      <span className="eyebrow mb-4">The idea</span>
      <h1 className="text-4xl sm:text-5xl mb-8 leading-[1.05]">
        The AI can teach almost anything. It just doesn’t know what’s worth learning.
      </h1>

      <div className="space-y-5 text-lg text-ink-2 leading-relaxed">
        <p>
          If you type “teach me finance” into a chatbot, you get a shallow, generic answer —
          because <em>you</em> don’t yet know which sub-topics matter, and the model won’t
          push you toward them. The hard part of learning something new isn’t the
          explaining. It’s knowing what to ask.
        </p>
        <p>
          That’s what a Prompt Learning course is: a carefully engineered curriculum,
          distilled from the people who genuinely teach a subject best, packed into a single
          prompt. You paste it into the AI you already use and it becomes a patient,
          adaptive tutor — one that meets you at your level, quizzes you, and won’t let you
          bluff your way to the end.
        </p>
        <p>
          Every course is free. The only ask is a quick sign-in, so the good stuff isn’t
          just floating loose on the internet.
        </p>
      </div>

      <div className="my-12 border-t border-line" />

      <h2 className="text-2xl mb-5">What makes a course here different</h2>
      <ul className="space-y-4">
        {[
          ["It’s curated, not generated.", "Each course is filtered down from the best free teaching on earth — and it cites its sources."],
          ["It adapts to you.", "Dumb it down, go deeper, switch language, use your own example. A video can’t do that."],
          ["It makes it stick.", "You apply every lesson to something real and graduate with a one-pager you keep."],
        ].map(([h, p]) => (
          <li key={h} className="flex gap-4">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            <span>
              <strong className="font-semibold">{h}</strong>{" "}
              <span className="text-ink-2">{p}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <Link href="/courses" className="btn btn-primary">
          Browse the courses
        </Link>
      </div>
    </div>
  );
}
