import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Native auth writes whole user snapshots outside collection hooks.
  await db.execute(sql`
    CREATE FUNCTION public.binturong_guard_account_authority() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
    BEGIN
      IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled IS DISTINCT FROM OLD.disabled)
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
    CREATE TRIGGER binturong_account_authority_guard
      BEFORE UPDATE OF role, disabled ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.binturong_guard_account_authority();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER binturong_account_authority_guard ON public.users;
    DROP FUNCTION public.binturong_guard_account_authority();
  `)
}
