ALTER TABLE "enrollments" ADD COLUMN "bite_module" integer;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "bite_step" integer DEFAULT 0 NOT NULL;