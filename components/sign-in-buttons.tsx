import { providerIds } from "@/auth";
import { signInWith } from "@/app/actions/auth";

const LABELS: Record<string, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  credentials: "Continue as guest (dev)",
};

export function SignInButtons({ redirectTo = "/courses" }: { redirectTo?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {providerIds.map((id) => {
        const action = signInWith.bind(null, id, redirectTo);
        const isPrimary = id === "google" || (id === "dev" && !providerIds.includes("google"));
        return (
          <form key={id} action={action}>
            <button
              type="submit"
              className={`btn w-full ${isPrimary ? "btn-primary" : "btn-ghost"}`}
            >
              {id === "google" && <GoogleGlyph />}
              {LABELS[id] ?? `Continue with ${id}`}
            </button>
          </form>
        );
      })}
      {providerIds.length === 0 && (
        <p className="text-sm text-muted">
          No sign-in method configured yet. Add OAuth keys to <code>.env.local</code>.
        </p>
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M9 7.4v3.3h4.6a4 4 0 0 1-1.7 2.6v2.1h2.8A8.3 8.3 0 0 0 17.3 9c0-.6 0-1.1-.2-1.6H9Z"
        opacity=".9"
      />
      <path
        fill="currentColor"
        d="M9 17.3c2.3 0 4.2-.8 5.6-2l-2.8-2.1c-.8.5-1.7.8-2.8.8-2.2 0-4-1.4-4.7-3.4H1.4v2.2A8.3 8.3 0 0 0 9 17.3Z"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M4.3 10.6a5 5 0 0 1 0-3.2V5.2H1.4a8.3 8.3 0 0 0 0 7.6l2.9-2.2Z"
        opacity=".45"
      />
      <path
        fill="currentColor"
        d="M9 3.9c1.2 0 2.4.4 3.2 1.3l2.5-2.5A8.3 8.3 0 0 0 1.4 5.2l2.9 2.2C5 5.4 6.8 3.9 9 3.9Z"
        opacity=".75"
      />
    </svg>
  );
}
