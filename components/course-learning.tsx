"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { completeLessonAction, startCourseAction } from "@/app/actions/learning";
import { LessonPlayer } from "@/components/lesson-player";
import { PromptPanel } from "@/components/prompt-panel";
import type { LearningState } from "@/lib/course-learning";

type Module = { n: string; module: string };

type Props = {
  courseRef: string;
  title: string;
  modules: Module[];
  state: LearningState;
};

/** The course sidebar: start → paced lessons → done. */
export function CourseLearning({ courseRef, title, modules, state }: Props) {
  if (state.kind === "signedOut") {
    return (
      <PromptPanel
        prompts={state.teaser}
        title={title}
        signedIn={false}
        signInHref={state.signInHref}
      />
    );
  }
  if (state.kind === "notStarted") {
    return <StartCard courseRef={courseRef} modules={modules} state={state} />;
  }
  return <Learning courseRef={courseRef} title={title} modules={modules} state={state} />;
}

/* ------------------------------------------------------------------ */

function StartCard({
  courseRef,
  modules,
  state,
}: {
  courseRef: string;
  modules: Module[];
  state: Extract<LearningState, { kind: "notStarted" }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const outOfCourses = state.coursesLeft !== null && state.coursesLeft <= 0;
  const resets = useLocalDate(state.monthResetsAt, { month: "short", day: "numeric" });

  return (
    <div className="card p-6">
      <span className="eyebrow mb-3 inline-block">Start learning</span>
      <p className="text-lg font-semibold leading-snug mb-1">
        {modules.length} lessons, one at a time
      </p>
      <p className="text-sm text-ink-2 mb-5">
        Each lesson is a short prompt you paste into your AI. Pass its gate, come back,
        and the next one unlocks.
      </p>

      {outOfCourses ? (
        <>
          <div className="rounded-[var(--radius-sm)] bg-bg-2 px-4 py-3 text-sm text-ink-2 mb-4">
            You’ve used your {state.coursesPerMonth} {plural(state.coursesPerMonth ?? 0, "course")}{" "}
            this month on {state.planName}.{resets && ` More on ${resets}.`}
          </div>
          <Link href="/pricing" className="btn btn-primary w-full">
            Upgrade for more courses
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await startCourseAction(courseRef);
                if (!res.ok) setError(res.error);
              })
            }
            className="btn btn-primary w-full disabled:opacity-60"
          >
            {pending ? "Starting…" : "Start this course"}
          </button>
          <p className="mt-3 text-xs text-muted">
            {state.coursesLeft === null
              ? `Unlimited courses on ${state.planName}.`
              : `Uses 1 of your ${state.coursesLeft} ${plural(state.coursesLeft, "course")} left this month (${state.planName}).`}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-ink-2">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Learning({
  courseRef,
  title,
  modules,
  state,
}: {
  courseRef: string;
  title: string;
  modules: Module[];
  state: Extract<LearningState, { kind: "learning" }>;
}) {
  const [mode, setMode] = useState<"chat" | "lesson" | "full">("chat");
  const [playing, setPlaying] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = new Set(state.completed);
  const total = modules.length;
  const finished = state.current === null;
  const current = state.current;

  function markComplete() {
    if (current === null) return;
    startTransition(async () => {
      setError(null);
      const res = await completeLessonAction(courseRef, current);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* progress + lesson path */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-semibold">
            {finished ? "Course complete" : `Lesson ${(current ?? 0) + 1} of ${total}`}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {done.size}/{total} done
          </span>
        </div>
        <div className="h-2 rounded-full bg-bg-3 overflow-hidden mb-4" aria-hidden>
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${(done.size / Math.max(1, total)) * 100}%` }}
          />
        </div>
        <ol className="space-y-1.5">
          {modules.map((m, i) => {
            const isDone = done.has(i);
            const isCurrent = i === current;
            return (
              <li
                key={m.n}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${
                  isCurrent ? "bg-bg-2 font-semibold" : ""
                } ${!isDone && !isCurrent ? "text-muted" : "text-ink-2"}`}
              >
                <span aria-hidden className="w-5 text-center">
                  {isDone ? "✓" : isCurrent ? "📍" : "🔒"}
                </span>
                <span className="font-mono text-xs tabular-nums">{m.n}</span>
                <span className="truncate">{m.module}</span>
                <span className="sr-only">
                  {isDone ? "(done)" : isCurrent ? "(current)" : "(locked)"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {finished ? (
        <div className="card p-6 text-center">
          <div className="text-4xl mb-3" aria-hidden>🎓</div>
          <p className="text-lg font-semibold mb-1">You finished every lesson!</p>
          <p className="text-sm text-ink-2">Graduation badges are coming soon.</p>
        </div>
      ) : (
        <>
          {state.lesson && (
            <div className="flex gap-1 rounded-full bg-bg-2 p-1 text-sm" role="tablist">
              {(
                [
                  ["chat", "📚 Learn here"],
                  ["lesson", "Your own AI"],
                  ...(state.full ? ([["full", "Whole course"]] as const) : []),
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 font-medium transition-colors ${
                    mode === m ? "bg-white shadow-[var(--shadow-sm)] text-ink" : "text-ink-2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "chat" && state.lesson && state.chat ? (
            <>
              <div className="card p-6">
                <span className="eyebrow mb-3 inline-block">
                  Today’s lesson · {modules[state.chat.moduleIndex]?.n}
                </span>
                <p className="text-xl font-semibold leading-snug mb-1">
                  {modules[state.chat.moduleIndex]?.module}
                </p>
                <p className="text-sm text-ink-2 mb-5">
                  Bite-sized steps with a quick check after each one. About 5 minutes.
                </p>
                <button type="button" onClick={() => setPlaying(true)} className="btn btn-primary w-full">
                  Start lesson →
                </button>
              </div>
              {state.lessonsPerDay !== null && (
                <p className="text-xs text-muted text-center">
                  {state.planName}: {state.lessonsPerDay} {plural(state.lessonsPerDay, "lesson")} a day ·{" "}
                  <Link href="/pricing" className="link-accent">
                    go faster
                  </Link>
                </p>
              )}
              {playing && (
                <LessonPlayer
                  courseRef={courseRef}
                  courseTitle={title}
                  moduleIndex={state.chat.moduleIndex}
                  moduleN={modules[state.chat.moduleIndex]?.n ?? String(state.chat.moduleIndex).padStart(2, "0")}
                  moduleTitle={modules[state.chat.moduleIndex]?.module ?? ""}
                  isLastLesson={state.chat.moduleIndex === modules.length - 1}
                  chat={state.chat}
                  onClose={() => setPlaying(false)}
                />
              )}
            </>
          ) : mode === "full" && state.full ? (
            <PromptPanel prompts={state.full} title={title} signedIn signInHref="/signin" />
          ) : state.lesson ? (
            <>
              <PromptPanel
                prompts={state.lesson}
                title={title}
                signedIn
                signInHref="/signin"
                fileLabel={`lesson-${modules[current!]?.n ?? current}`}
                hint="Paste this into your AI and learn today’s lesson. When you pass its gate, come back here and mark it complete."
              />
              <button
                type="button"
                onClick={markComplete}
                disabled={pending}
                className="btn btn-dark w-full disabled:opacity-60"
              >
                {pending ? "Saving…" : "✓ Mark lesson complete"}
              </button>
              {state.lessonsPerDay !== null && (
                <p className="text-xs text-muted text-center">
                  {state.planName}: {state.lessonsPerDay}{" "}
                  {plural(state.lessonsPerDay, "lesson")} a day ·{" "}
                  <Link href="/pricing" className="link-accent">
                    go faster
                  </Link>
                </p>
              )}
            </>
          ) : (
            <LockedCard resetsAt={state.dayResetsAt} planName={state.planName} />
          )}
          {error && (
            <p role="alert" className="text-sm text-ink-2 text-center">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function LockedCard({ resetsAt, planName }: { resetsAt: string; planName: string }) {
  const left = useCountdown(resetsAt);
  return (
    <div className="card p-6 text-center">
      <div className="text-4xl mb-3" aria-hidden>🔥</div>
      <p className="text-lg font-semibold mb-1">Today’s lesson is done</p>
      <p className="text-sm text-ink-2 mb-5">
        Nice. Your next lesson unlocks {left ? <>in <strong className="tabular-nums">{left}</strong></> : "tomorrow"}.
        <br />
        Small daily steps beat cramming.
      </p>
      <Link href="/pricing" className="btn btn-ghost w-full">
        Learn at your own pace with Plus
      </Link>
      <p className="mt-2 text-xs text-muted">You’re on {planName}.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Client-only time helpers (rendered after mount to avoid hydration   */
/*  mismatches between server and browser clocks/time zones).           */
/* ------------------------------------------------------------------ */

function useCountdown(iso: string): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const target = new Date(iso).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        setText(null);
        window.location.reload(); // the lesson just unlocked
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setText(h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`);
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [iso]);
  return text;
}

function useLocalDate(iso: string, opts: Intl.DateTimeFormatOptions): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setText(new Date(iso).toLocaleDateString(undefined, opts)), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return text;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
