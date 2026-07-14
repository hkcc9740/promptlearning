import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";

const providers: NextAuthConfig["providers"] = [];

// Real OAuth — activated automatically once the env keys are present.
// (Auth.js reads AUTH_GOOGLE_ID/SECRET and AUTH_GITHUB_ID/SECRET by convention.)
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);

// Dev-only guest login so the unlock flow works before OAuth is configured.
if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      name: "Guest",
      credentials: {},
      authorize: async () => ({
        id: "guest",
        name: "Guest Learner",
        email: "guest@promptacademy.dev",
      }),
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
  trustHost: true,
});
