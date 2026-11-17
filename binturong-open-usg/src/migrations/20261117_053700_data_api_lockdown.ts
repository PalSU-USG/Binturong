import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Supabase's Data API (PostgREST) serves schema public to the anon and authenticated roles.
// Binturong never uses it: Payload connects directly as the table owner, which RLS does not
// restrict unless forced. So up() turns RLS on for every public table with no policies, and
// removes the Supabase grants and default privileges that give those roles table access.
// Plain PostgreSQL has no anon/authenticated roles; the role steps then do nothing.
// RLS and grants are not part of Payload's schema snapshot, so this migration has no .json.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE target text; role_name text; owner_name text;
    BEGIN
      FOR target IN SELECT relname FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
      END LOOP;
      FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
        EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);
        -- Future Payload tables are created by postgres (or the migrating user): start them closed.
        FOR owner_name IN SELECT rolname FROM pg_roles
          WHERE rolname IN ('postgres', current_user) AND pg_has_role(current_user, oid, 'MEMBER') LOOP
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', owner_name, role_name);
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', owner_name, role_name);
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', owner_name, role_name);
        END LOOP;
      END LOOP;
    END $$;
  `)
}

// down() disables RLS on every public table and restores what a Supabase project grants by
// default to anon and authenticated in schema public (observed in the local Supabase image's
// postgres database on 17 Nov 2026): ALL on every table and sequence, EXECUTE on every
// function, and the same as default privileges for objects postgres (or the migrating user)
// creates. It then re-applies the revokes of migrations 20261022_051329, 20261022_071500 and
// 20261022_075642, which keep the domain tables closed. On a database that never had the
// Supabase defaults (for example one made with CREATE DATABASE), down() grants more than
// existed before up().
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE target text; role_name text; owner_name text;
    BEGIN
      FOR target IN SELECT relname FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', target);
      END LOOP;
      FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %I', role_name);
        EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', role_name);
        EXECUTE format('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO %I', role_name);
        FOR owner_name IN SELECT rolname FROM pg_roles
          WHERE rolname IN ('postgres', current_user) AND pg_has_role(current_user, oid, 'MEMBER') LOOP
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %I', owner_name, role_name);
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', owner_name, role_name);
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', owner_name, role_name);
        END LOOP;
        EXECUTE format('REVOKE ALL ON TABLE public.organizations, public._organizations_v,
          public.academic_years, public._academic_years_v, public.offices, public._offices_v,
          public.people, public.people_terms, public._people_v, public._people_v_version_terms,
          public.activities, public._activities_v, public.documents, public.issuances,
          public.issuances_rels, public._issuances_v, public._issuances_v_rels, public.reports,
          public.reports_rels, public._reports_v, public._reports_v_rels FROM %I', role_name);
        EXECUTE format('REVOKE ALL ON SEQUENCE public.organizations_id_seq, public._organizations_v_id_seq,
          public.academic_years_id_seq, public._academic_years_v_id_seq, public.offices_id_seq,
          public._offices_v_id_seq, public.people_id_seq, public._people_v_id_seq,
          public._people_v_version_terms_id_seq, public.activities_id_seq, public._activities_v_id_seq,
          public.documents_id_seq, public.issuances_id_seq, public.issuances_rels_id_seq,
          public._issuances_v_id_seq, public._issuances_v_rels_id_seq, public.reports_id_seq,
          public.reports_rels_id_seq, public._reports_v_id_seq, public._reports_v_rels_id_seq FROM %I', role_name);
      END LOOP;
    END $$;
  `)
}
