import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "documents" ADD COLUMN "upload_actor" numeric;
  ALTER TABLE "documents" ADD COLUMN "upload_request_id" varchar;
  ALTER TABLE "documents" ADD COLUMN "upload_request_hash" varchar;
  ALTER TABLE "documents" ADD COLUMN "staging_key" varchar;
  ALTER TABLE "documents" ADD COLUMN "upload_expires_at" timestamp(3) with time zone;
  ALTER TABLE "documents" ADD COLUMN "verified_at" timestamp(3) with time zone;
  CREATE INDEX "documents_upload_actor_idx" ON "documents" USING btree ("upload_actor");
  CREATE UNIQUE INDEX "documents_upload_request_id_idx" ON "documents" USING btree ("upload_request_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "documents_upload_actor_idx";
  DROP INDEX "documents_upload_request_id_idx";
  ALTER TABLE "documents" DROP COLUMN "upload_actor";
  ALTER TABLE "documents" DROP COLUMN "upload_request_id";
  ALTER TABLE "documents" DROP COLUMN "upload_request_hash";
  ALTER TABLE "documents" DROP COLUMN "staging_key";
  ALTER TABLE "documents" DROP COLUMN "upload_expires_at";
  ALTER TABLE "documents" DROP COLUMN "verified_at";`)
}
