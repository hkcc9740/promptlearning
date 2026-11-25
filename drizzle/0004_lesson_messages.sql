CREATE TABLE "lesson_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_ref" text NOT NULL,
	"module_index" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_messages" ADD CONSTRAINT "lesson_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_messages_thread_idx" ON "lesson_messages" USING btree ("user_id","course_ref","module_index","id");--> statement-breakpoint
CREATE INDEX "lesson_messages_user_created_idx" ON "lesson_messages" USING btree ("user_id","created_at");