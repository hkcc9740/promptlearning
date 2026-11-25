"use client";

import { useTransition } from "react";
import { deleteGeneratedCourseAction } from "@/app/actions/generate-course";

export function RemoveCourseButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove “${title}” from your library? This can’t be undone.`)) return;
        startTransition(() => deleteGeneratedCourseAction(id));
      }}
      className="relative z-10 text-muted hover:text-ink transition-colors disabled:opacity-60"
      aria-label={`Remove ${title} from library`}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
