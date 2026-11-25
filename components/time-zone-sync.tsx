"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE } from "@/lib/time-zone";

/**
 * Tells the server the learner's time zone (via a cookie) so daily lessons and
 * the monthly course quota reset at their local midnight. Refreshes once when
 * the zone is first learned or changes, so server-rendered countdowns are right.
 */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${TZ_COOKIE}=`))
        ?.slice(TZ_COOKIE.length + 1);
      if (current && decodeURIComponent(current) === tz) return;
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    } catch {
      /* cookies blocked — server falls back to the saved zone or UTC */
    }
  }, [router]);
  return null;
}
