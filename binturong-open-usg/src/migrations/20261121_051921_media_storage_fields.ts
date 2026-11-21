import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Columns the S3 storage adapter keeps on media (`prefix`, `_objectKey`). They are added on every
// database, with storage on or off, so local and hosted schemas match. Guarded so a hand-repaired
// or partly migrated database does not block `vercel-build`.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "prefix" varchar DEFAULT '';
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "_objectkey" varchar;`)
}

// Drops the stored object folder of any file uploaded while cloud storage was on.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN IF EXISTS "prefix";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "_objectkey";`)
}
