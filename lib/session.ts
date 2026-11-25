// Server-only helpers for "who is signed in" + making sure they exist in the DB.
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

/** The signed-in user, or null. Sessions minted before ids were namespaced have no id → null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.id.includes(":")) return null;
  return { id: u.id, name: u.name ?? null, email: u.email ?? null, image: u.image ?? null };
}

/** Insert or refresh the user's row (call before writing anything they own). */
export async function ensureUser(user: SessionUser): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.users)
    .values(user)
    .onConflictDoUpdate({
      target: schema.users.id,
      set: { name: user.name, email: user.email, image: user.image, updatedAt: new Date() },
    });
}
