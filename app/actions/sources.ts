"use server";

import { auth } from "@/auth";
import { resolveInput, searchBooks, type ResolveResult } from "@/lib/sources/resolve";
import type { ShelfSource } from "@/lib/sources/kinds";

export async function resolveSourceAction(input: string): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user) return { type: "error", error: "Please sign in to add sources." };
  if (typeof input !== "string" || input.length > 2000) return { type: "error", error: "That's too long." };
  return resolveInput(input);
}

export async function searchBooksAction(query: string): Promise<ShelfSource[]> {
  const session = await auth();
  if (!session?.user || typeof query !== "string") return [];
  return searchBooks(query);
}
