import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_documents_state" AS ENUM('pending', 'ready', 'failed');
  CREATE TYPE "public"."enum_issuances_type" AS ENUM('executive_order', 'memorandum', 'act', 'resolution', 'advisory');
  CREATE TYPE "public"."enum_issuances_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__issuances_v_version_type" AS ENUM('executive_order', 'memorandum', 'act', 'resolution', 'advisory');
  CREATE TYPE "public"."enum__issuances_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_reports_type" AS ENUM('financial', 'accomplishment');
  CREATE TYPE "public"."enum_reports_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__reports_v_version_type" AS ENUM('financial', 'accomplishment');
  CREATE TYPE "public"."enum__reports_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "documents" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "title" varchar NOT NULL,
    "state" "enum_documents_state" DEFAULT 'pending' NOT NULL,
    "storage_key" varchar,
    "original_filename" varchar,
    "mime_type" varchar,
    "size" numeric,
    "sha256" varchar,
    "previous_version_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "issuances" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar,
    "organization_id" integer,
    "issuing_office_id" integer,
    "type" "enum_issuances_type",
    "document_number" varchar,
    "series_year" numeric,
    "issued_date" timestamp(3) with time zone,
    "effective_date" timestamp(3) with time zone,
    "academic_year_id" integer,
    "summary" jsonb,
    "main_document_id" integer,
    "generate_slug" boolean DEFAULT true,
    "slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_issuances_status" DEFAULT 'draft'
  );

  CREATE TABLE "issuances_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "documents_id" integer,
    "issuances_id" integer,
    "reports_id" integer,
    "posts_id" integer,
    "activities_id" integer
  );

  CREATE TABLE "_issuances_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_title" varchar,
    "version_organization_id" integer,
    "version_issuing_office_id" integer,
    "version_type" "enum__issuances_v_version_type",
    "version_document_number" varchar,
    "version_series_year" numeric,
    "version_issued_date" timestamp(3) with time zone,
    "version_effective_date" timestamp(3) with time zone,
    "version_academic_year_id" integer,
    "version_summary" jsonb,
    "version_main_document_id" integer,
    "version_generate_slug" boolean DEFAULT true,
    "version_slug" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__issuances_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  CREATE TABLE "_issuances_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "documents_id" integer,
    "issuances_id" integer,
    "reports_id" integer,
    "posts_id" integer,
    "activities_id" integer
  );

  CREATE TABLE "reports" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar,
    "organization_id" integer,
    "type" "enum_reports_type",
    "reporting_period" varchar,
    "period_start_date" timestamp(3) with time zone,
    "period_end_date" timestamp(3) with time zone,
    "academic_year_id" integer,
    "abstract" jsonb,
    "source_version_label" varchar,
    "main_document_id" integer,
    "generate_slug" boolean DEFAULT true,
    "slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_reports_status" DEFAULT 'draft'
  );

  CREATE TABLE "reports_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "offices_id" integer,
    "documents_id" integer,
    "issuances_id" integer,
    "reports_id" integer,
    "posts_id" integer,
    "activities_id" integer
  );

  CREATE TABLE "_reports_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_title" varchar,
    "version_organization_id" integer,
    "version_type" "enum__reports_v_version_type",
    "version_reporting_period" varchar,
    "version_period_start_date" timestamp(3) with time zone,
    "version_period_end_date" timestamp(3) with time zone,
    "version_academic_year_id" integer,
    "version_abstract" jsonb,
    "version_source_version_label" varchar,
    "version_main_document_id" integer,
    "version_generate_slug" boolean DEFAULT true,
    "version_slug" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__reports_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  CREATE TABLE "_reports_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "offices_id" integer,
    "documents_id" integer,
    "issuances_id" integer,
    "reports_id" integer,
    "posts_id" integer,
    "activities_id" integer
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "documents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "issuances_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reports_id" integer;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_previous_version_id_documents_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuances" ADD CONSTRAINT "issuances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuances" ADD CONSTRAINT "issuances_issuing_office_id_offices_id_fk" FOREIGN KEY ("issuing_office_id") REFERENCES "public"."offices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuances" ADD CONSTRAINT "issuances_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuances" ADD CONSTRAINT "issuances_main_document_id_documents_id_fk" FOREIGN KEY ("main_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuances_rels" ADD CONSTRAINT "issuances_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuances_rels" ADD CONSTRAINT "issuances_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuances_rels" ADD CONSTRAINT "issuances_rels_issuances_fk" FOREIGN KEY ("issuances_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuances_rels" ADD CONSTRAINT "issuances_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuances_rels" ADD CONSTRAINT "issuances_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuances_rels" ADD CONSTRAINT "issuances_rels_activities_fk" FOREIGN KEY ("activities_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_issuances_v" ADD CONSTRAINT "_issuances_v_parent_id_issuances_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."issuances"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_issuances_v" ADD CONSTRAINT "_issuances_v_version_organization_id_organizations_id_fk" FOREIGN KEY ("version_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_issuances_v" ADD CONSTRAINT "_issuances_v_version_issuing_office_id_offices_id_fk" FOREIGN KEY ("version_issuing_office_id") REFERENCES "public"."offices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_issuances_v" ADD CONSTRAINT "_issuances_v_version_academic_year_id_academic_years_id_fk" FOREIGN KEY ("version_academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_issuances_v" ADD CONSTRAINT "_issuances_v_version_main_document_id_documents_id_fk" FOREIGN KEY ("version_main_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_issuances_v_rels" ADD CONSTRAINT "_issuances_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_issuances_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_issuances_v_rels" ADD CONSTRAINT "_issuances_v_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_issuances_v_rels" ADD CONSTRAINT "_issuances_v_rels_issuances_fk" FOREIGN KEY ("issuances_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_issuances_v_rels" ADD CONSTRAINT "_issuances_v_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_issuances_v_rels" ADD CONSTRAINT "_issuances_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_issuances_v_rels" ADD CONSTRAINT "_issuances_v_rels_activities_fk" FOREIGN KEY ("activities_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_main_document_id_documents_id_fk" FOREIGN KEY ("main_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_offices_fk" FOREIGN KEY ("offices_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_issuances_fk" FOREIGN KEY ("issuances_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reports_rels" ADD CONSTRAINT "reports_rels_activities_fk" FOREIGN KEY ("activities_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v" ADD CONSTRAINT "_reports_v_parent_id_reports_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reports_v" ADD CONSTRAINT "_reports_v_version_organization_id_organizations_id_fk" FOREIGN KEY ("version_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reports_v" ADD CONSTRAINT "_reports_v_version_academic_year_id_academic_years_id_fk" FOREIGN KEY ("version_academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reports_v" ADD CONSTRAINT "_reports_v_version_main_document_id_documents_id_fk" FOREIGN KEY ("version_main_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_reports_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_offices_fk" FOREIGN KEY ("offices_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_issuances_fk" FOREIGN KEY ("issuances_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_reports_v_rels" ADD CONSTRAINT "_reports_v_rels_activities_fk" FOREIGN KEY ("activities_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "documents_organization_idx" ON "documents" USING btree ("organization_id");
  CREATE INDEX "documents_previous_version_idx" ON "documents" USING btree ("previous_version_id");
  CREATE INDEX "documents_updated_at_idx" ON "documents" USING btree ("updated_at");
  CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");
  CREATE INDEX "issuances_organization_idx" ON "issuances" USING btree ("organization_id");
  CREATE INDEX "issuances_issuing_office_idx" ON "issuances" USING btree ("issuing_office_id");
  CREATE INDEX "issuances_academic_year_idx" ON "issuances" USING btree ("academic_year_id");
  CREATE INDEX "issuances_main_document_idx" ON "issuances" USING btree ("main_document_id");
  CREATE UNIQUE INDEX "issuances_slug_idx" ON "issuances" USING btree ("slug");
  CREATE INDEX "issuances_updated_at_idx" ON "issuances" USING btree ("updated_at");
  CREATE INDEX "issuances_created_at_idx" ON "issuances" USING btree ("created_at");
  CREATE INDEX "issuances__status_idx" ON "issuances" USING btree ("_status");
  CREATE INDEX "issuances_rels_order_idx" ON "issuances_rels" USING btree ("order");
  CREATE INDEX "issuances_rels_parent_idx" ON "issuances_rels" USING btree ("parent_id");
  CREATE INDEX "issuances_rels_path_idx" ON "issuances_rels" USING btree ("path");
  CREATE INDEX "issuances_rels_documents_id_idx" ON "issuances_rels" USING btree ("documents_id");
  CREATE INDEX "issuances_rels_issuances_id_idx" ON "issuances_rels" USING btree ("issuances_id");
  CREATE INDEX "issuances_rels_reports_id_idx" ON "issuances_rels" USING btree ("reports_id");
  CREATE INDEX "issuances_rels_posts_id_idx" ON "issuances_rels" USING btree ("posts_id");
  CREATE INDEX "issuances_rels_activities_id_idx" ON "issuances_rels" USING btree ("activities_id");
  CREATE INDEX "_issuances_v_parent_idx" ON "_issuances_v" USING btree ("parent_id");
  CREATE INDEX "_issuances_v_version_version_organization_idx" ON "_issuances_v" USING btree ("version_organization_id");
  CREATE INDEX "_issuances_v_version_version_issuing_office_idx" ON "_issuances_v" USING btree ("version_issuing_office_id");
  CREATE INDEX "_issuances_v_version_version_academic_year_idx" ON "_issuances_v" USING btree ("version_academic_year_id");
  CREATE INDEX "_issuances_v_version_version_main_document_idx" ON "_issuances_v" USING btree ("version_main_document_id");
  CREATE INDEX "_issuances_v_version_version_slug_idx" ON "_issuances_v" USING btree ("version_slug");
  CREATE INDEX "_issuances_v_version_version_updated_at_idx" ON "_issuances_v" USING btree ("version_updated_at");
  CREATE INDEX "_issuances_v_version_version_created_at_idx" ON "_issuances_v" USING btree ("version_created_at");
  CREATE INDEX "_issuances_v_version_version__status_idx" ON "_issuances_v" USING btree ("version__status");
  CREATE INDEX "_issuances_v_created_at_idx" ON "_issuances_v" USING btree ("created_at");
  CREATE INDEX "_issuances_v_updated_at_idx" ON "_issuances_v" USING btree ("updated_at");
  CREATE INDEX "_issuances_v_latest_idx" ON "_issuances_v" USING btree ("latest");
  CREATE INDEX "_issuances_v_rels_order_idx" ON "_issuances_v_rels" USING btree ("order");
  CREATE INDEX "_issuances_v_rels_parent_idx" ON "_issuances_v_rels" USING btree ("parent_id");
  CREATE INDEX "_issuances_v_rels_path_idx" ON "_issuances_v_rels" USING btree ("path");
  CREATE INDEX "_issuances_v_rels_documents_id_idx" ON "_issuances_v_rels" USING btree ("documents_id");
  CREATE INDEX "_issuances_v_rels_issuances_id_idx" ON "_issuances_v_rels" USING btree ("issuances_id");
  CREATE INDEX "_issuances_v_rels_reports_id_idx" ON "_issuances_v_rels" USING btree ("reports_id");
  CREATE INDEX "_issuances_v_rels_posts_id_idx" ON "_issuances_v_rels" USING btree ("posts_id");
  CREATE INDEX "_issuances_v_rels_activities_id_idx" ON "_issuances_v_rels" USING btree ("activities_id");
  CREATE INDEX "reports_organization_idx" ON "reports" USING btree ("organization_id");
  CREATE INDEX "reports_academic_year_idx" ON "reports" USING btree ("academic_year_id");
  CREATE INDEX "reports_main_document_idx" ON "reports" USING btree ("main_document_id");
  CREATE UNIQUE INDEX "reports_slug_idx" ON "reports" USING btree ("slug");
  CREATE INDEX "reports_updated_at_idx" ON "reports" USING btree ("updated_at");
  CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");
  CREATE INDEX "reports__status_idx" ON "reports" USING btree ("_status");
  CREATE INDEX "reports_rels_order_idx" ON "reports_rels" USING btree ("order");
  CREATE INDEX "reports_rels_parent_idx" ON "reports_rels" USING btree ("parent_id");
  CREATE INDEX "reports_rels_path_idx" ON "reports_rels" USING btree ("path");
  CREATE INDEX "reports_rels_offices_id_idx" ON "reports_rels" USING btree ("offices_id");
  CREATE INDEX "reports_rels_documents_id_idx" ON "reports_rels" USING btree ("documents_id");
  CREATE INDEX "reports_rels_issuances_id_idx" ON "reports_rels" USING btree ("issuances_id");
  CREATE INDEX "reports_rels_reports_id_idx" ON "reports_rels" USING btree ("reports_id");
  CREATE INDEX "reports_rels_posts_id_idx" ON "reports_rels" USING btree ("posts_id");
  CREATE INDEX "reports_rels_activities_id_idx" ON "reports_rels" USING btree ("activities_id");
  CREATE INDEX "_reports_v_parent_idx" ON "_reports_v" USING btree ("parent_id");
  CREATE INDEX "_reports_v_version_version_organization_idx" ON "_reports_v" USING btree ("version_organization_id");
  CREATE INDEX "_reports_v_version_version_academic_year_idx" ON "_reports_v" USING btree ("version_academic_year_id");
  CREATE INDEX "_reports_v_version_version_main_document_idx" ON "_reports_v" USING btree ("version_main_document_id");
  CREATE INDEX "_reports_v_version_version_slug_idx" ON "_reports_v" USING btree ("version_slug");
  CREATE INDEX "_reports_v_version_version_updated_at_idx" ON "_reports_v" USING btree ("version_updated_at");
  CREATE INDEX "_reports_v_version_version_created_at_idx" ON "_reports_v" USING btree ("version_created_at");
  CREATE INDEX "_reports_v_version_version__status_idx" ON "_reports_v" USING btree ("version__status");
  CREATE INDEX "_reports_v_created_at_idx" ON "_reports_v" USING btree ("created_at");
  CREATE INDEX "_reports_v_updated_at_idx" ON "_reports_v" USING btree ("updated_at");
  CREATE INDEX "_reports_v_latest_idx" ON "_reports_v" USING btree ("latest");
  CREATE INDEX "_reports_v_rels_order_idx" ON "_reports_v_rels" USING btree ("order");
  CREATE INDEX "_reports_v_rels_parent_idx" ON "_reports_v_rels" USING btree ("parent_id");
  CREATE INDEX "_reports_v_rels_path_idx" ON "_reports_v_rels" USING btree ("path");
  CREATE INDEX "_reports_v_rels_offices_id_idx" ON "_reports_v_rels" USING btree ("offices_id");
  CREATE INDEX "_reports_v_rels_documents_id_idx" ON "_reports_v_rels" USING btree ("documents_id");
  CREATE INDEX "_reports_v_rels_issuances_id_idx" ON "_reports_v_rels" USING btree ("issuances_id");
  CREATE INDEX "_reports_v_rels_reports_id_idx" ON "_reports_v_rels" USING btree ("reports_id");
  CREATE INDEX "_reports_v_rels_posts_id_idx" ON "_reports_v_rels" USING btree ("posts_id");
  CREATE INDEX "_reports_v_rels_activities_id_idx" ON "_reports_v_rels" USING btree ("activities_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_issuances_fk" FOREIGN KEY ("issuances_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("documents_id");
  CREATE INDEX "payload_locked_documents_rels_issuances_id_idx" ON "payload_locked_documents_rels" USING btree ("issuances_id");
  CREATE INDEX "payload_locked_documents_rels_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("reports_id");`)
  await db.execute(sql`
    REVOKE ALL ON TABLE public.documents, public.issuances, public.issuances_rels, public._issuances_v, public._issuances_v_rels, public.reports, public.reports_rels, public._reports_v, public._reports_v_rels FROM PUBLIC;
    REVOKE ALL ON SEQUENCE public.documents_id_seq, public.issuances_id_seq, public.issuances_rels_id_seq, public._issuances_v_id_seq, public._issuances_v_rels_id_seq, public.reports_id_seq, public.reports_rels_id_seq, public._reports_v_id_seq, public._reports_v_rels_id_seq FROM PUBLIC;
    DO $$
    DECLARE role_name text;
    BEGIN
      FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.documents, public.issuances, public.issuances_rels, public._issuances_v, public._issuances_v_rels, public.reports, public.reports_rels, public._reports_v, public._reports_v_rels FROM %I', role_name);
        EXECUTE format('REVOKE ALL ON SEQUENCE public.documents_id_seq, public.issuances_id_seq, public.issuances_rels_id_seq, public._issuances_v_id_seq, public._issuances_v_rels_id_seq, public.reports_id_seq, public.reports_rels_id_seq, public._reports_v_id_seq, public._reports_v_rels_id_seq FROM %I', role_name);
      END LOOP;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "issuances" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "issuances_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_issuances_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_issuances_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reports_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_reports_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_reports_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "documents" CASCADE;
  DROP TABLE "issuances" CASCADE;
  DROP TABLE "issuances_rels" CASCADE;
  DROP TABLE "_issuances_v" CASCADE;
  DROP TABLE "_issuances_v_rels" CASCADE;
  DROP TABLE "reports" CASCADE;
  DROP TABLE "reports_rels" CASCADE;
  DROP TABLE "_reports_v" CASCADE;
  DROP TABLE "_reports_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_documents_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_issuances_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reports_fk";

  DROP INDEX "payload_locked_documents_rels_documents_id_idx";
  DROP INDEX "payload_locked_documents_rels_issuances_id_idx";
  DROP INDEX "payload_locked_documents_rels_reports_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "documents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "issuances_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reports_id";
  DROP TYPE "public"."enum_documents_state";
  DROP TYPE "public"."enum_issuances_type";
  DROP TYPE "public"."enum_issuances_status";
  DROP TYPE "public"."enum__issuances_v_version_type";
  DROP TYPE "public"."enum__issuances_v_version_status";
  DROP TYPE "public"."enum_reports_type";
  DROP TYPE "public"."enum_reports_status";
  DROP TYPE "public"."enum__reports_v_version_type";
  DROP TYPE "public"."enum__reports_v_version_status";`)
}
