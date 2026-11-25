import {
  boolean,
  index,
  integer,
  serial,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { GeneratedCourse } from "@/lib/generate";

/**
 * A learner. `id` is "<provider>:<subject>" from Auth.js (e.g. "google:1234…",
 * "credentials:<guest-uuid>") so ids stay stable and never collide across providers.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  image: text("image"),

  // Billing (kept in sync from Stripe webhooks). `plan` only counts while the
  // subscription status is active/trialing/past_due — see lib/entitlements.ts.
  plan: text("plan").notNull().default("free"), // "free" | "plus" | "pro"
  billingInterval: text("billing_interval"), // "monthly" | "annual"
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** True once the learner has used the discounted first month. */
  introUsed: boolean("intro_used").notNull().default(false),

  /** IANA zone from the browser (e.g. "Asia/Hong_Kong"); daily lessons and the
   *  monthly quota reset at the learner's local midnight. null → UTC. */
  timeZone: text("time_zone"),
  timeZoneUpdatedAt: timestamp("time_zone_updated_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A course a learner generated. The full GeneratedCourse lives in `data`; a few
 * fields are lifted into columns for listing/sorting without parsing JSON.
 */
export const generatedCourses = pgTable(
  "generated_courses",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    icon: text("icon").notNull(),
    category: text("category").notNull(),
    sourceUrl: text("source_url"),
    /** Learner-uploaded cover, resized client-side, stored as a data URL (≤ ~350 KB). */
    imageData: text("image_data"),
    data: jsonb("data").$type<GeneratedCourse>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("generated_courses_owner_created_idx").on(t.ownerId, t.createdAt)],
);

/**
 * A learner started a course. Starting is what the monthly quota counts.
 * `courseRef` is "static:<slug>" for catalog courses or "gen:<id>" for generated
 * ones. No FK to generated_courses on purpose: deleting a course doesn't refund quota.
 */
export const enrollments = pgTable(
  "enrollments",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseRef: text("course_ref").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Where the learner left off inside the current lesson's bites (for resuming). */
    biteModule: integer("bite_module"),
    biteStep: integer("bite_step").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.courseRef] }),
    index("enrollments_user_started_idx").on(t.userId, t.startedAt),
  ],
);

/** One row per lesson (syllabus module) a learner marked complete. */
export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseRef: text("course_ref").notNull(),
    moduleIndex: integer("module_index").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.courseRef, t.moduleIndex] }),
    index("lesson_completions_user_completed_idx").on(t.userId, t.completedAt),
  ],
);

/** The in-site AI tutor conversation, one thread per learner × course × lesson. */
export const lessonMessages = pgTable(
  "lesson_messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseRef: text("course_ref").notNull(),
    moduleIndex: integer("module_index").notNull(),
    role: text("role").notNull(), // "user" | "model"
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lesson_messages_thread_idx").on(t.userId, t.courseRef, t.moduleIndex, t.id),
    index("lesson_messages_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * Generated "bites" for one lesson, cached so every learner (and every revisit)
 * reuses them instead of spending another AI call. Shape: see lib/bites.ts.
 */
export const lessonContent = pgTable(
  "lesson_content",
  {
    courseRef: text("course_ref").notNull(),
    moduleIndex: integer("module_index").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.courseRef, t.moduleIndex] })],
);

export type UserRow = typeof users.$inferSelect;
export type GeneratedCourseRow = typeof generatedCourses.$inferSelect;
