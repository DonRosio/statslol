CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"key_generation" smallint NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
