import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "search" ADD COLUMN "identifier" varchar;
  ALTER TABLE "search" ADD COLUMN "identifier_key" varchar;
  ALTER TABLE "search" ADD COLUMN "summary" varchar;
  ALTER TABLE "search" ADD COLUMN "published_at" timestamp(3) with time zone;
  ALTER TABLE "search" ADD COLUMN "sort_at" timestamp(3) with time zone;
  ALTER TABLE "search_rels" ADD COLUMN "issuances_id" integer;
  ALTER TABLE "search_rels" ADD COLUMN "reports_id" integer;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_issuances_fk" FOREIGN KEY ("issuances_id") REFERENCES "public"."issuances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "search_sort_at_idx" ON "search" USING btree ("sort_at");
  CREATE INDEX "search_rels_issuances_id_idx" ON "search_rels" USING btree ("issuances_id");
  CREATE INDEX "search_rels_reports_id_idx" ON "search_rels" USING btree ("reports_id");
  -- Existing rows keep a stable order until the published-only reindex refreshes them.
  UPDATE "search" SET "sort_at" = "created_at" WHERE "sort_at" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "search_rels" DROP CONSTRAINT "search_rels_issuances_fk";
  
  ALTER TABLE "search_rels" DROP CONSTRAINT "search_rels_reports_fk";
  
  DROP INDEX "search_sort_at_idx";
  DROP INDEX "search_rels_issuances_id_idx";
  DROP INDEX "search_rels_reports_id_idx";
  ALTER TABLE "search" DROP COLUMN "identifier";
  ALTER TABLE "search" DROP COLUMN "identifier_key";
  ALTER TABLE "search" DROP COLUMN "summary";
  ALTER TABLE "search" DROP COLUMN "published_at";
  ALTER TABLE "search" DROP COLUMN "sort_at";
  ALTER TABLE "search_rels" DROP COLUMN "issuances_id";
  ALTER TABLE "search_rels" DROP COLUMN "reports_id";`)
}
