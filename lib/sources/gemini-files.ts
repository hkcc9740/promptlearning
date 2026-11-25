// Server-only: upload a file to the Gemini Files API (kept ~48h) and return its URI.
// Files are referenced from generation requests instead of re-sending bytes.

export const GEMINI_FILE_PREFIX = "https://generativelanguage.googleapis.com/";

export async function uploadToGemini(
  bytes: ArrayBuffer,
  mimeType: string,
  displayName: string,
): Promise<{ uri: string; mimeType: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");

  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`Upload start failed (${start.status}).`);

  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!done.ok) throw new Error(`Upload failed (${done.status}).`);
  const json = (await done.json()) as { file?: { uri?: string; mimeType?: string } };
  if (!json.file?.uri?.startsWith(GEMINI_FILE_PREFIX)) throw new Error("Upload returned no file.");
  return { uri: json.file.uri, mimeType: json.file.mimeType ?? mimeType };
}
