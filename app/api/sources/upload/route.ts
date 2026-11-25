import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { MAX_PDF_BYTES, type ShelfSource } from "@/lib/sources/kinds";
import { uploadToGemini } from "@/lib/sources/gemini-files";

// PDF upload for the Source shelf. A Route Handler (not a Server Action) because
// actions cap request bodies at 1 MB by default.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES + 64 * 1024) {
    return Response.json({ error: "PDFs can be up to 20 MB." }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    /* fallthrough */
  }
  if (!file) return Response.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: "PDFs can be up to 20 MB." }, { status: 413 });

  const bytes = await file.arrayBuffer();
  // Check the magic number, not just the extension / declared type.
  const head = new Uint8Array(bytes.slice(0, 5));
  if (String.fromCharCode(...head) !== "%PDF-") {
    return Response.json({ error: "That file isn't a PDF." }, { status: 415 });
  }

  try {
    const uploaded = await uploadToGemini(bytes, "application/pdf", file.name || "document.pdf");
    const source: ShelfSource = {
      id: randomUUID(),
      kind: "paper",
      title: (file.name || "Document").replace(/\.pdf$/i, "").slice(0, 300),
      subtitle: `PDF · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
      file: uploaded,
      quality: "ready",
    };
    return Response.json({ source });
  } catch (e) {
    console.error("PDF upload failed", e);
    return Response.json({ error: "Couldn't upload that PDF. Please try again." }, { status: 502 });
  }
}
