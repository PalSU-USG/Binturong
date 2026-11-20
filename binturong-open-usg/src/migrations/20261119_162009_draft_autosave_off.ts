import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Guarded so a hand-repaired or partly migrated database does not block `vercel-build`.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "_pages_v_autosave_idx";
  DROP INDEX IF EXISTS "_posts_v_autosave_idx";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "autosave";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "autosave";`)
}

// Restores the shape only: the old per-version autosave markers come back as NULL.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "autosave" boolean;
  ALTER TABLE "_posts_v" ADD COLUMN IF NOT EXISTS "autosave" boolean;
  CREATE INDEX IF NOT EXISTS "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX IF NOT EXISTS "_posts_v_autosave_idx" ON "_posts_v" USING btree ("autosave");`)
}
