import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_organizations_kind" AS ENUM('usg', 'csg', 'university_unit');
  CREATE TYPE "public"."enum_organizations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__organizations_v_version_kind" AS ENUM('usg', 'csg', 'university_unit');
  CREATE TYPE "public"."enum__organizations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_academic_years_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__academic_years_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "organizations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "kind" "enum_organizations_kind",
    "participating" boolean DEFAULT false,
    "generate_slug" boolean DEFAULT true,
    "slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_organizations_status" DEFAULT 'draft'
  );

  CREATE TABLE "_organizations_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_name" varchar,
    "version_kind" "enum__organizations_v_version_kind",
    "version_participating" boolean DEFAULT false,
    "version_generate_slug" boolean DEFAULT true,
    "version_slug" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__organizations_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  CREATE TABLE "academic_years" (
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar,
    "start_date" timestamp(3) with time zone,
    "end_date" timestamp(3) with time zone,
    "generate_slug" boolean DEFAULT true,
    "slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_academic_years_status" DEFAULT 'draft'
  );

  CREATE TABLE "_academic_years_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_label" varchar,
    "version_start_date" timestamp(3) with time zone,
    "version_end_date" timestamp(3) with time zone,
    "version_generate_slug" boolean DEFAULT true,
    "version_slug" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__academic_years_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organizations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "academic_years_id" integer;
  ALTER TABLE "_organizations_v" ADD CONSTRAINT "_organizations_v_parent_id_organizations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_academic_years_v" ADD CONSTRAINT "_academic_years_v_parent_id_academic_years_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "organizations__status_idx" ON "organizations" USING btree ("_status");
  CREATE INDEX "_organizations_v_parent_idx" ON "_organizations_v" USING btree ("parent_id");
  CREATE INDEX "_organizations_v_version_version_slug_idx" ON "_organizations_v" USING btree ("version_slug");
  CREATE INDEX "_organizations_v_version_version_updated_at_idx" ON "_organizations_v" USING btree ("version_updated_at");
  CREATE INDEX "_organizations_v_version_version_created_at_idx" ON "_organizations_v" USING btree ("version_created_at");
  CREATE INDEX "_organizations_v_version_version__status_idx" ON "_organizations_v" USING btree ("version__status");
  CREATE INDEX "_organizations_v_created_at_idx" ON "_organizations_v" USING btree ("created_at");
  CREATE INDEX "_organizations_v_updated_at_idx" ON "_organizations_v" USING btree ("updated_at");
  CREATE INDEX "_organizations_v_latest_idx" ON "_organizations_v" USING btree ("latest");
  CREATE UNIQUE INDEX "academic_years_slug_idx" ON "academic_years" USING btree ("slug");
  CREATE INDEX "academic_years_updated_at_idx" ON "academic_years" USING btree ("updated_at");
  CREATE INDEX "academic_years_created_at_idx" ON "academic_years" USING btree ("created_at");
  CREATE INDEX "academic_years__status_idx" ON "academic_years" USING btree ("_status");
  CREATE INDEX "_academic_years_v_parent_idx" ON "_academic_years_v" USING btree ("parent_id");
  CREATE INDEX "_academic_years_v_version_version_slug_idx" ON "_academic_years_v" USING btree ("version_slug");
  CREATE INDEX "_academic_years_v_version_version_updated_at_idx" ON "_academic_years_v" USING btree ("version_updated_at");
  CREATE INDEX "_academic_years_v_version_version_created_at_idx" ON "_academic_years_v" USING btree ("version_created_at");
  CREATE INDEX "_academic_years_v_version_version__status_idx" ON "_academic_years_v" USING btree ("version__status");
  CREATE INDEX "_academic_years_v_created_at_idx" ON "_academic_years_v" USING btree ("created_at");
  CREATE INDEX "_academic_years_v_updated_at_idx" ON "_academic_years_v" USING btree ("updated_at");
  CREATE INDEX "_academic_years_v_latest_idx" ON "_academic_years_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_academic_years_fk" FOREIGN KEY ("academic_years_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_academic_years_id_idx" ON "payload_locked_documents_rels" USING btree ("academic_years_id");`)
  await db.execute(sql`
    REVOKE ALL ON TABLE public.organizations, public._organizations_v,
      public.academic_years, public._academic_years_v FROM PUBLIC;
    REVOKE ALL ON SEQUENCE public.organizations_id_seq, public._organizations_v_id_seq,
      public.academic_years_id_seq, public._academic_years_v_id_seq FROM PUBLIC;
    DO $$
    DECLARE role_name text;
    BEGIN
      FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.organizations, public._organizations_v,
          public.academic_years, public._academic_years_v FROM %I', role_name);
        EXECUTE format('REVOKE ALL ON SEQUENCE public.organizations_id_seq, public._organizations_v_id_seq,
          public.academic_years_id_seq, public._academic_years_v_id_seq FROM %I', role_name);
      END LOOP;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_organizations_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "academic_years" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_academic_years_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "organizations" CASCADE;
  DROP TABLE "_organizations_v" CASCADE;
  DROP TABLE "academic_years" CASCADE;
  DROP TABLE "_academic_years_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_organizations_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_academic_years_fk";

  DROP INDEX "payload_locked_documents_rels_organizations_id_idx";
  DROP INDEX "payload_locked_documents_rels_academic_years_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organizations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "academic_years_id";
  DROP TYPE "public"."enum_organizations_kind";
  DROP TYPE "public"."enum_organizations_status";
  DROP TYPE "public"."enum__organizations_v_version_kind";
  DROP TYPE "public"."enum__organizations_v_version_status";
  DROP TYPE "public"."enum_academic_years_status";
  DROP TYPE "public"."enum__academic_years_v_version_status";`)
}
