import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "access_requests" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" varchar NOT NULL,
    "name" varchar,
    "requested_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "access_requests_id" integer;
  CREATE UNIQUE INDEX "access_requests_email_idx" ON "access_requests" USING btree ("email");
  CREATE INDEX "access_requests_updated_at_idx" ON "access_requests" USING btree ("updated_at");
  CREATE INDEX "access_requests_created_at_idx" ON "access_requests" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_access_requests_fk" FOREIGN KEY ("access_requests_id") REFERENCES "public"."access_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_access_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("access_requests_id");
  ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;
  DO $$
  DECLARE role_name text;
  BEGIN
    FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.access_requests FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.access_requests_id_seq FROM %I', role_name);
    END LOOP;
  END $$;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "access_requests_id";
    DROP TABLE "access_requests";`)
}
