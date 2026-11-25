"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

type Msg = { role: "user" | "model"; content: string };

const SIGNAL = "\u001e";
const KICKOFF = "Hi! I'm ready to start this lesson.";

type Props = {
  courseRef: string;
  moduleIndex: number;
  lessonTitle: string;
  initialMessages: Msg[];
  messagesLeftToday: number | null;
};

/** The in-site AI tutor for one lesson. Streams replies; auto-completes on the gate. */
export function LessonChat({ courseRef, moduleIndex, lessonTitle, initialMessages, messagesLeftToday }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(messagesLeftToday);
  const [completed, setCompleted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, expanded]);

  // Esc closes the expanded view; stop any stream when leaving.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    if (streaming) return;
    const content = text.trim();
    if (!content && messages.length > 0) return;
    setError(null);
    setInput("");
    setStreaming(true);
    const shown = content || KICKOFF;
    setMessages((m) => [...m, { role: "user", content: shown }, { role: "model", content: "" }]);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseRef, moduleIndex, message: content }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "The tutor couldn’t answer. Please try again.");
      }
      if (left !== null) setLeft((n) => (n === null ? n : Math.max(0, n - 1)));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      let lessonDone = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const sig = reply.indexOf(SIGNAL);
        const visible = sig >= 0 ? reply.slice(0, sig) : reply;
        if (sig >= 0) {
          const signal = reply.slice(sig + 1);
          if (signal.startsWith("LESSON_COMPLETE")) lessonDone = true;
          if (signal.startsWith("ERROR:")) setError(signal.slice(6));
        }
        setMessages((m) => [...m.slice(0, -1), { role: "model", content: visible }]);
      }
      if (lessonDone) {
        setCompleted(true);
        // Let the learner read the congrats, then refresh to unlock the next step.
        setTimeout(() => router.refresh(), 2500);
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      // Drop the empty placeholder reply.
      setMessages((m) => (m.at(-1)?.role === "model" && !m.at(-1)?.content ? m.slice(0, -1) : m));
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  const outOfMessages = left !== null && left <= 0;
  const notStarted = messages.length === 0;

  const panel = (
    <div
      className={`card flex flex-col overflow-hidden ${
        expanded ? "h-full w-full max-w-3xl mx-auto shadow-[var(--shadow-lg)]" : "h-[min(70vh,640px)]"
      }`}
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white text-sm">
          🎓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Your tutor</p>
          <p className="truncate text-xs text-muted">{lessonTitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-bg-2"
          aria-label={expanded ? "Exit full screen" : "Full screen"}
          title={expanded ? "Exit full screen (Esc)" : "Full screen"}
        >
          {expanded ? "⤡" : "⤢"}
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
        {notStarted ? (
          <div className="h-full grid place-items-center text-center px-4">
            <div>
              <div className="text-4xl mb-3" aria-hidden>👋</div>
              <p className="font-semibold mb-1">Ready when you are</p>
              <p className="text-sm text-ink-2 mb-5">
                Your tutor teaches this lesson one step at a time, then checks you got it.
              </p>
              <button
                type="button"
                onClick={() => send("")}
                disabled={streaming || outOfMessages}
                className="btn btn-primary disabled:opacity-60"
              >
                Start the lesson
              </button>
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-bg-2 px-3.5 py-2.5 text-sm text-ink">
                  {m.content ? (
                    <Markdown text={m.content} />
                  ) : (
                    <span className="inline-flex gap-1 py-1" aria-label="Tutor is typing">
                      <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                    </span>
                  )}
                </div>
              </div>
            ),
          )
        )}
        {completed && (
          <div role="status" className="rounded-2xl border border-line bg-white px-4 py-3 text-center text-sm">
            🎉 <strong>Lesson complete!</strong> Saving your progress…
          </div>
        )}
      </div>

      {/* composer */}
      {!notStarted && (
        <form
          className="border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {error && (
            <p role="alert" className="mb-2 text-xs text-ink-2">
              ⚠ {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={4000}
              disabled={outOfMessages || completed}
              placeholder={outOfMessages ? "No messages left today" : "Type your answer…"}
              aria-label="Message your tutor"
              className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ink disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim() || outOfMessages || completed}
              className="btn btn-primary btn-sm h-[42px] disabled:opacity-60"
            >
              {streaming ? "…" : "Send"}
            </button>
          </div>
          {left !== null && (
            <p className="mt-1.5 text-[0.7rem] text-muted">
              {left} {left === 1 ? "message" : "messages"} left today
            </p>
          )}
        </form>
      )}
      {notStarted && error && (
        <p role="alert" className="border-t border-line px-4 py-2 text-xs text-ink-2">
          ⚠ {error}
        </p>
      )}
    </div>
  );

  return expanded ? (
    <div className="fixed inset-0 z-50 bg-black/30 p-3 sm:p-6" onClick={() => setExpanded(false)}>
      <div className="h-full" onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
    </div>
  ) : (
    panel
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay }}
    />
  );
}
