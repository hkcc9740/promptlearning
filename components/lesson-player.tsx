"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { completeLessonAction, getLessonBitesAction } from "@/app/actions/learning";
import type { Bite } from "@/lib/bites";
import { LessonChat } from "@/components/lesson-chat";
import { Markdown } from "@/components/markdown";

type ChatProps = {
  moduleIndex: number;
  messages: { role: "user" | "model"; content: string }[];
  messagesLeftToday: number | null;
};

type Props = {
  courseRef: string;
  courseTitle: string;
  moduleIndex: number;
  moduleN: string; // "00"
  moduleTitle: string;
  isLastLesson: boolean;
  chat: ChatProps | null;
  onClose: () => void;
};

const LETTERS = ["A", "B", "C", "D", "E"];

/** Full-screen, Duolingo-style lesson: explain → scenario question → feedback, bite by bite. */
export function LessonPlayer(props: Props) {
  // Freeze the lesson this player opened with: finishing it refreshes the page
  // underneath, which would otherwise swap in the NEXT lesson's details.
  const [frozen] = useState(props);
  const { courseRef, courseTitle, moduleIndex, moduleN, moduleTitle, isLastLesson, chat } = frozen;
  const onClose = props.onClose;
  const router = useRouter();
  const [bites, setBites] = useState<Bite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<number[]>([]); // wrong picks on this bite
  const [solved, setSolved] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState<null | { ok: boolean; message?: string }>(null);
  const [tutorOpen, setTutorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setBites(null);
    const res = await getLessonBitesAction(courseRef, moduleIndex).catch(() => ({
      ok: false as const,
      error: "Couldn’t load the lesson. Check your connection and try again.",
    }));
    if (res.ok) setBites(res.bites);
    else setLoadError(res.error);
  }, [courseRef, moduleIndex]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Take over the screen: lock page scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const bite = bites?.[step];
  const total = bites?.length ?? 0;
  const isLastBite = !!bites && step === total - 1;

  function pick(i: number) {
    if (!bite || solved) return;
    if (i === bite.correct) setSolved(true);
    else if (!tried.includes(i)) setTried((t) => [...t, i]);
  }

  async function next() {
    if (!solved || !bites) return;
    if (!isLastBite) {
      setStep((s) => s + 1);
      setTried([]);
      setSolved(false);
      setShowHint(false);
      document.getElementById("lesson-scroll")?.scrollTo({ top: 0 });
      return;
    }
    setFinishing(true);
    const res = await completeLessonAction(courseRef, moduleIndex).catch(() => ({
      ok: false as const,
      error: "Couldn’t save your progress. Please try again.",
    }));
    setFinishing(false);
    setFinished(res.ok ? { ok: true } : { ok: false, message: res.error });
  }

  function close() {
    if (finished?.ok) router.refresh();
    onClose();
  }

  // Keyboard: A–D / 1–4 to answer, Enter to continue, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tutorOpen || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") return close();
      if (finished) return;
      if (e.key === "Enter" && solved) return void next();
      const idx = "abcde".indexOf(e.key.toLowerCase());
      const num = Number(e.key) - 1;
      const i = idx >= 0 ? idx : Number.isInteger(num) && num >= 0 ? num : -1;
      if (bite && i >= 0 && i < bite.options.length) pick(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function copyQuestion() {
    if (!bite) return;
    const text = `${bite.question}\n\n${bite.options.map((o, i) => `${LETTERS[i]}. ${o.text}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      flash("Question copied");
    } catch {
      flash("Couldn’t copy");
    }
  }

  async function share() {
    if (!bite) return;
    const data = {
      title: `${courseTitle}: ${bite.title}`,
      text: `${bite.question}\n\n${bite.options.map((o, i) => `${LETTERS[i]}. ${o.text}`).join("\n")}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(`${data.text}\n\n${data.url}`);
        flash("Copied to share");
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)]" role="dialog" aria-modal="true" aria-label={`Lesson: ${moduleTitle}`}>
      {/* top bar */}
      <div className="flex items-center gap-4 border-b border-line px-4 sm:px-6 h-14 shrink-0">
        <button
          type="button"
          onClick={close}
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-bg-2"
          aria-label="Close lesson"
          title="Close (Esc)"
        >
          ✕
        </button>
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {(bites ?? [0, 1, 2, 3]).map((_, i) => (
            <div key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-bg-3">
              <div
                className="h-full rounded-full bg-[#3f9c4f] transition-[width] duration-500"
                style={{
                  width: finished?.ok || i < step || (i === step && solved) ? "100%" : "0%",
                }}
              />
            </div>
          ))}
        </div>
        {chat && (
          <button
            type="button"
            onClick={() => setTutorOpen((o) => !o)}
            className="btn btn-ghost btn-sm shrink-0"
          >
            💬 Ask tutor
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* lesson body */}
        <div id="lesson-scroll" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-8 sm:py-12">
            {finished?.ok ? (
              <Celebration
                moduleTitle={moduleTitle}
                isLastLesson={isLastLesson}
                onDone={close}
              />
            ) : loadError ? (
              <div className="py-20 text-center">
                <p className="mb-4 text-ink-2">{loadError}</p>
                <button type="button" onClick={load} className="btn btn-primary">
                  Try again
                </button>
              </div>
            ) : !bite ? (
              <Preparing />
            ) : (
              <>
                <p className="text-lg sm:text-xl font-semibold">
                  Module {moduleN} · Bite {step + 1} of {total}
                </p>
                <h2 className="mt-1 text-base sm:text-lg font-semibold">{bite.title}</h2>
                <div className="mt-4 text-[1.05rem] sm:text-lg leading-relaxed text-ink">
                  <Markdown text={bite.explain} />
                </div>

                <div className="mt-8 rounded-[var(--radius)] border border-line bg-white p-5 sm:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <p className="flex-1 text-[1.05rem] sm:text-lg leading-snug">{bite.question}</p>
                    <div className="order-first sm:order-none flex shrink-0 items-center justify-end gap-1 -mt-2 sm:-mt-1 -mr-2 sm:mr-0">
                      {bite.hint && (
                        <IconButton
                          label={showHint ? "Hide hint" : "Show hint"}
                          active={showHint}
                          onClick={() => setShowHint((h) => !h)}
                        >
                          <BulbIcon filled={showHint} />
                        </IconButton>
                      )}
                      <IconButton label="Copy question" onClick={copyQuestion}>
                        <CopyIcon />
                      </IconButton>
                      <IconButton label="Share" onClick={share}>
                        <ShareIcon />
                      </IconButton>
                    </div>
                  </div>
                  {showHint && <p className="mt-2 text-ink-2 leading-relaxed">{bite.hint}</p>}

                  <ul className="mt-5 space-y-2" role="radiogroup" aria-label="Answers">
                    {bite.options.map((o, i) => {
                      const right = solved && i === bite.correct;
                      const wrong = tried.includes(i);
                      const dim = solved && !right;
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={right || wrong}
                            onClick={() => pick(i)}
                            disabled={solved || wrong}
                            className={`group flex w-full items-start gap-4 rounded-2xl px-2 py-2.5 text-left transition-colors ${
                              solved || wrong ? "cursor-default" : "hover:bg-bg-2"
                            }`}
                          >
                            <span
                              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border text-base font-medium transition-colors ${
                                right
                                  ? "border-[#3f9c4f] bg-[#3f9c4f] text-white"
                                  : wrong
                                    ? "border-[#d9534f] bg-[#d9534f] text-white"
                                    : "border-line text-muted group-hover:border-ink"
                              }`}
                            >
                              {LETTERS[i]}
                            </span>
                            <span className="min-w-0 pt-2">
                              <span
                                className={`block text-[1.02rem] sm:text-lg leading-snug ${
                                  dim ? "text-muted" : wrong ? "text-ink-2" : "text-ink"
                                }`}
                              >
                                {o.text}
                              </span>
                              {(right || wrong) && o.why && (
                                <span className={`mt-1.5 block text-[0.95rem] leading-relaxed ${right ? "text-ink-2" : "text-[#b3403c]"}`}>
                                  {o.why}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>

        {/* tutor side panel */}
        {chat && tutorOpen && (
          <aside className="fixed inset-x-0 bottom-0 top-14 z-10 flex flex-col bg-bg-2 p-3 min-h-0 sm:static sm:z-auto sm:w-[400px] sm:shrink-0 sm:border-l sm:border-line">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold">Stuck? Ask your tutor</p>
              <button
                type="button"
                onClick={() => setTutorOpen(false)}
                className="text-sm text-muted hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1">
            <LessonChat
              courseRef={courseRef}
              moduleIndex={chat.moduleIndex}
              lessonTitle={moduleTitle}
              initialMessages={chat.messages}
              messagesLeftToday={chat.messagesLeftToday}
              helper
              context={
                bite
                  ? `Bite ${step + 1} of ${total}: ${bite.title}\n${bite.explain}\nQuestion: ${bite.question}\nOptions: ${bite.options
                      .map((o, i) => `${LETTERS[i]}. ${o.text}`)
                      .join(" | ")}`
                  : ""
              }
            />
            </div>
          </aside>
        )}
      </div>

      {/* bottom bar */}
      {bite && !finished?.ok && (
        <div
          className={`shrink-0 border-t px-4 sm:px-6 py-4 transition-colors ${
            solved ? "border-[#cfe9d3] bg-[#eef8f0]" : "border-line bg-[var(--bg)]"
          }`}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
            <p className="flex-1 text-sm sm:text-base font-semibold">
              {solved ? (
                <span className="text-[#2f7a3c]">✓ Nice, that’s right!</span>
              ) : tried.length ? (
                <span className="text-[#b3403c]">Not quite. Read why, then try another.</span>
              ) : (
                <span className="text-muted font-normal">Pick the best answer</span>
              )}
              {finished && !finished.ok && (
                <span className="block text-sm font-normal text-ink-2">{finished.message}</span>
              )}
            </p>
            <button
              type="button"
              onClick={next}
              disabled={!solved || finishing}
              className="btn btn-primary min-w-[140px] disabled:opacity-50"
            >
              {finishing ? "Saving…" : isLastBite ? "Finish lesson" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function Preparing() {
  const lines = ["Reading the sources…", "Writing your bites…", "Making the quiz questions…"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 2500);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="py-24 text-center">
      <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-ink" aria-hidden />
      <p className="font-semibold">Preparing your lesson</p>
      <p className="mt-1 text-sm text-muted animate-pulse">{lines[i]}</p>
      <p className="mt-6 text-xs text-muted">The first time takes a few seconds. After that it’s instant.</p>
    </div>
  );
}

function Celebration({
  moduleTitle,
  isLastLesson,
  onDone,
}: {
  moduleTitle: string;
  isLastLesson: boolean;
  onDone: () => void;
}) {
  return (
    <div className="py-16 text-center">
      <div className="text-6xl mb-5" aria-hidden>{isLastLesson ? "🎓" : "🎉"}</div>
      <h2 className="text-3xl font-semibold mb-2">{isLastLesson ? "Course complete!" : "Lesson complete!"}</h2>
      <p className="text-ink-2 mb-8">
        You finished <strong>{moduleTitle}</strong>.
      </p>
      <button type="button" onClick={onDone} className="btn btn-primary min-w-[200px]">
        Back to the course
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-ink-2 hover:bg-bg-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

function BulbIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
