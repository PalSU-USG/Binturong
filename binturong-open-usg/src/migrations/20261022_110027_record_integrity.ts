import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Frozen migration rule: do not replace with the mutable application helper.
export function normalizeLegacyDocumentNumber(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC')
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuances" ADD COLUMN "normalized_number" varchar;
  ALTER TABLE "_issuances_v" ADD COLUMN "version_normalized_number" varchar;`)
  for (const [table, source, normalized] of [
    ['issuances', 'document_number', 'normalized_number'],
    ['_issuances_v', 'version_document_number', 'version_normalized_number'],
  ]) {
    let cursor = 0
    while (true) {
      const batch = await db.execute<{ id: number; number: string | null }>(sql`
        select id, ${sql.identifier(source)} as number from ${sql.identifier(table)}
        where id > ${cursor} order by id limit 500`)
      if (!batch.rows.length) break
      for (const row of batch.rows) {
        const value = row.number === null ? null : normalizeLegacyDocumentNumber(row.number) || null
        await db.execute(sql`update ${sql.identifier(table)}
          set ${sql.identifier(normalized)} = ${value} where id = ${row.id}`)
        cursor = row.id
      }
    }
  }
  const conflicts = await db.execute(sql`
    with heads as (
      select distinct on (parent_id) parent_id, version_organization_id as organization_id,
        version_type::text as type, version_series_year as series_year,
        version_normalized_number as normalized_number
      from _issuances_v where parent_id is not null
      order by parent_id, updated_at desc, id desc
    ), reservations as (
      select id as parent_id, organization_id, type::text, series_year, normalized_number from issuances
      union all select * from heads
    ) select 1 from reservations
      where organization_id is not null and type is not null and series_year is not null
        and normalized_number is not null
      group by organization_id, type, series_year, normalized_number
      having count(distinct parent_id) > 1 limit 1`)
  if (conflicts.rows.length)
    throw new Error(
      'Conflicting canonical or latest draft issuance numbers prevent migration adoption.',
    )
  await db.execute(sql`
  CREATE UNIQUE INDEX "organization_type_seriesYear_normalizedNumber_idx" ON "issuances" USING btree ("organization_id","type","series_year","normalized_number");
  CREATE INDEX "compound_index_idx" ON "_issuances_v" USING btree ("version_organization_id","version_type","version_series_year","version_normalized_number");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "organization_type_seriesYear_normalizedNumber_idx";
  DROP INDEX "compound_index_idx";
  ALTER TABLE "issuances" DROP COLUMN "normalized_number";
  ALTER TABLE "_issuances_v" DROP COLUMN "version_normalized_number";`)
}
