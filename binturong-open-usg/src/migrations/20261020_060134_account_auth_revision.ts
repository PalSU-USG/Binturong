import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "auth_revision" numeric DEFAULT 0 NOT NULL;`)
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.binturong_guard_account_authority() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
    BEGIN
      IF NEW.auth_revision IS DISTINCT FROM OLD.auth_revision THEN
        RAISE EXCEPTION 'Stale account authentication revision' USING ERRCODE = '42501';
      END IF;
      IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled IS DISTINCT FROM OLD.disabled
        OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.salt IS DISTINCT FROM OLD.salt)
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_locks
          WHERE locktype = 'advisory' AND pid = pg_catalog.pg_backend_pid()
            AND classid = 20261020 AND objid = 1 AND objsubid = 2
            AND mode = 'ExclusiveLock' AND granted
        ) THEN
        RAISE EXCEPTION 'Account authority changes require the account transaction lock'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled IS DISTINCT FROM OLD.disabled
        OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.salt IS DISTINCT FROM OLD.salt THEN
        NEW.auth_revision := OLD.auth_revision + 1;
      END IF;
      RETURN NEW;
    END;
    $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.binturong_guard_account_authority() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
    BEGIN
      IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled IS DISTINCT FROM OLD.disabled
        OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.salt IS DISTINCT FROM OLD.salt)
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_locks
          WHERE locktype = 'advisory' AND pid = pg_catalog.pg_backend_pid()
            AND classid = 20261020 AND objid = 1 AND objsubid = 2
            AND mode = 'ExclusiveLock' AND granted
        ) THEN
        RAISE EXCEPTION 'Account authority changes require the account transaction lock'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END;
    $$;
  `)
  await db.execute(sql`ALTER TABLE "users" DROP COLUMN "auth_revision";`)
}
