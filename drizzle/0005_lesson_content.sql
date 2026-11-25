CREATE TABLE "lesson_content" (
	"course_ref" text NOT NULL,
	"module_index" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_content_course_ref_module_index_pk" PRIMARY KEY("course_ref","module_index")
);
