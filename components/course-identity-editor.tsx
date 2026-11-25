"use client";

import { useRef, useState, useTransition } from "react";
import { updateCourseIdentityAction } from "@/app/actions/generate-course";
import { CourseIcon } from "@/components/course-icon";

type Props = {
  courseId: string;
  title: string;
  icon: string;
  imageUrl: string | null;
};

const MAX_SIDE = 512; // px — plenty for a course icon, even on retina
const MAX_BYTES = 350_000; // after compression
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Owner-only: rename the course, swap its emoji, or upload a cover image.
 * Images are downscaled in the browser (max 512px, WebP/JPEG) before upload.
 */
export function CourseIdentityEditor({ courseId, title, icon, imageUrl }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftIcon, setDraftIcon] = useState(icon);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function save(update: { title?: string; icon?: string; image?: string | null }, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await updateCourseIdentityAction(courseId, update);
      if (!res.ok) setError(res.error);
      else done?.();
    });
  }

  async function onPickImage(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Pick an image file (PNG, JPEG, WebP…).");
    if (file.size > MAX_INPUT_BYTES) return setError("That image is over 25 MB.");
    setImageBusy(true);
    try {
      const dataUrl = await shrinkImage(file);
      save({ image: dataUrl });
    } catch {
      setError("Couldn't read that image. Try a PNG or JPEG.");
    } finally {
      setImageBusy(false);
    }
  }

  const busy = pending || imageBusy;

  return (
    <div className="mt-5">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="relative">
          <CourseIcon icon={icon} imageUrl={imageUrl} size="lg" />
          {busy && (
            <span className="absolute inset-0 grid place-items-center rounded-2xl bg-white/70 text-xs">…</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="btn btn-ghost btn-sm disabled:opacity-60"
          >
            {imageUrl ? "Change image" : "Upload image"}
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={() => save({ image: null })}
              disabled={busy}
              className="btn btn-ghost btn-sm disabled:opacity-60"
            >
              Use emoji instead
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setDraftTitle(title);
                setDraftIcon(icon);
                setEditing(true);
              }}
              className="btn btn-ghost btn-sm"
            >
              ✎ Rename
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
            e.target.value = "";
          }}
        />
      </div>

      {editing ? (
        <form
          className="mt-4 flex flex-col sm:flex-row gap-3 max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            save({ title: draftTitle, icon: draftIcon }, () => setEditing(false));
          }}
        >
          <input
            value={draftIcon}
            onChange={(e) => setDraftIcon(e.target.value)}
            aria-label="Course emoji"
            title="Course emoji"
            className="w-16 shrink-0 rounded-[var(--radius-sm)] border border-line bg-white px-2 py-2.5 text-center text-2xl outline-none focus:border-ink"
          />
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            maxLength={120}
            autoFocus
            aria-label="Course name"
            className="flex-1 min-w-0 rounded-[var(--radius-sm)] border border-line bg-white px-4 py-2.5 text-xl font-semibold outline-none focus:border-ink"
          />
          <div className="flex gap-2 shrink-0">
            <button type="submit" disabled={pending} className="btn btn-primary btn-sm disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <h1 className="mt-4 text-3xl sm:text-4xl max-w-3xl">{title}</h1>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-ink-2">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Downscale to fit MAX_SIDE × MAX_SIDE (center-cropped square, like an app icon)
 * and compress until it's under MAX_BYTES. Returns a data URL.
 */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  for (const [size, quality] of [
    [MAX_SIDE, 0.86],
    [MAX_SIDE, 0.72],
    [384, 0.72],
    [256, 0.7],
  ] as const) {
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);

    const blob =
      (await toBlob(canvas, "image/webp", quality)) ?? (await toBlob(canvas, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) {
      bitmap.close();
      return await blobToDataUrl(blob);
    }
  }
  bitmap.close();
  throw new Error("too big");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
