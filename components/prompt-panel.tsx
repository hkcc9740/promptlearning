"use client";

import Link from "next/link";
import { useState } from "react";
import type { AiTarget, PromptVariants } from "@/lib/courses";

type Props = {
  prompts: PromptVariants;
  title: string;
  signedIn: boolean;
  signInHref: string;
};

const TARGETS: { id: AiTarget; label: string; url: string }[] = [
  { id: "claude", label: "Claude", url: "https://claude.ai/new" },
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
];

export function PromptPanel({ prompts, title, signedIn, signInHref }: Props) {
  const [target, setTarget] = useState<AiTarget>("claude");
  const [copied, setCopied] = useState(false);

  const active = TARGETS.find((t) => t.id === target)!;
  const prompt = prompts[target];
  const lineCount = prompt.split("\n").length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function openIn() {
    await copy();
    window.open(active.url, "_blank", "noopener,noreferrer");
  }

  function switchTarget(id: AiTarget) {
    setTarget(id);
    setCopied(false);
  }

  return (
    <div className="prompt-shell">
      {/* AI target tabs */}
      <div
        className="flex items-center gap-1 px-3 pt-3 pb-0"
        style={{ background: "var(--code-bg-2)" }}
        role="tablist"
        aria-label="Choose your AI chat"
      >
        {TARGETS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === target}
            onClick={() => switchTarget(t.id)}
            className="rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors"
            style={
              t.id === target
                ? { background: "var(--code-bg)", color: "var(--ink)" }
                : { background: "transparent", color: "var(--code-muted)" }
            }
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto pr-2 pb-1 text-[0.68rem]" style={{ color: "var(--code-muted)" }}>
          {target === "claude" ? "optimized" : "v0"}
        </span>
      </div>

      <div className="prompt-bar">
        <span className="dot" style={{ background: "#ff5f57" }} />
        <span className="dot" style={{ background: "#febc2e" }} />
        <span className="dot" style={{ background: "#28c840" }} />
        <span className="ml-2 truncate">
          {title.toLowerCase().replace(/\s+/g, "-")}.{target}.txt
        </span>
        <span className="ml-auto tabular-nums">{lineCount} lines</span>
      </div>

      <div className="relative">
        <div
          className="prompt-body max-h-[380px] overflow-auto px-5 py-4"
          style={signedIn ? undefined : { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" }}
          aria-hidden={!signedIn}
        >
          {prompt}
        </div>

        {!signedIn && (
          <div className="absolute inset-0 grid place-items-center px-6">
            <div className="text-center max-w-xs">
              <div
                aria-hidden
                className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-white border border-line"
              >
                <LockGlyph />
              </div>
              <p className="text-lg font-semibold mb-1">
                Free — one sign-in unlocks every course
              </p>
              <p className="text-sm mb-4" style={{ color: "var(--code-muted)" }}>
                Sign in to reveal the full prompt and copy it into your AI.
              </p>
              <Link href={signInHref} className="btn btn-primary w-full">
                Sign in to unlock
              </Link>
            </div>
          </div>
        )}
      </div>

      {signedIn && (
        <div className="border-t px-5 py-4 space-y-3" style={{ borderColor: "var(--code-line)" }}>
          <button onClick={copy} className="btn btn-primary w-full">
            {copied ? "✓ Copied — now paste it in" : `Copy for ${active.label}`}
          </button>
          <button onClick={openIn} className="btn btn-ghost w-full">
            Copy & open {active.label}
          </button>
          <p className="text-xs leading-relaxed" style={{ color: "var(--code-muted)" }}>
            How to use: paste this into {active.label} and answer its first question. The
            course runs itself from there.
          </p>
        </div>
      )}
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" stroke="var(--ink)" strokeWidth="1.6" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="var(--ink)" strokeWidth="1.6" />
    </svg>
  );
}
