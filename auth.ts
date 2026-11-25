import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";

const providers: NextAuthConfig["providers"] = [];

// Real OAuth — activated automatically once the env keys are present.
// (Auth.js reads AUTH_GOOGLE_ID/SECRET and AUTH_GITHUB_ID/SECRET by convention.)
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dev-only guest login so the unlock flow works before OAuth is configured.
// Each browser gets its own stable guest id (kept in a cookie by signInWith), so a
// guest's library survives signing out and back in. Not a security boundary —
// this provider never exists in production.
if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      name: "Guest",
      credentials: { guestId: {} },
      authorize: async (credentials) => {
        const guestId = String(credentials?.guestId ?? "");
        if (!UUID_RE.test(guestId)) return null;
        return { id: guestId, name: "Guest Learner", email: null };
      },
    }),
  );
}

export const providerIds = providers
  .map((p) => (typeof p === "function" ? p().id : p.id))
  .filter(Boolean) as string[];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    // Namespace the user id by provider ("google:…", "credentials:…") so it is
    // stable and can't collide across providers. This is the DB user id.
    jwt({ token, account }) {
      if (account && token.sub) token.uid = `${account.provider}:${token.sub}`;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
  trustHost: true,
});
