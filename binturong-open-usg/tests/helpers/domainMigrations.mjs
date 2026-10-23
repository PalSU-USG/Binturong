import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import 'dotenv/config'
import { assertTestDatabase } from './assertTestDatabase.ts'

const mode = process.argv[2]
assert(['fresh', 'populated'].includes(mode))
const target = new URL(process.env.DATABASE_URL)

if (!process.argv[3]) {
  assertTestDatabase(target.toString())
  const pool = new pg.Pool({ connectionString: target.toString() })
  const name = `binturong_domain_proof_${mode}_${randomUUID().replaceAll('-', '').slice(0, 24)}`
  assert(new RegExp(`^binturong_domain_proof_${mode}_[a-f0-9]{24}$`).test(name))
  assert(name.length <= 63)
  try {
    await pool.query(`create database "${name}"`)
    const childURL = new URL(target)
    childURL.pathname = `/${name}`
    const child = spawnSync(
      process.execPath,
      ['--import=tsx', fileURLToPath(import.meta.url), mode, name],
      {
        env: { ...process.env, DATABASE_URL: childURL.toString(), PAYLOAD_MIGRATING: 'true' },
        timeout: 120000,
        encoding: 'utf8',
        windowsHide: true,
      },
    )
    process.stdout.write(child.stdout || '')
    process.stderr.write(child.stderr || '')
    console.info(`Preserved synthetic proof database: ${name}`)
    assert.equal(child.status, 0, child.error?.message ?? `Migration proof failed: ${mode}`)
  } finally {
    await pool.end()
  }
} else {
  assert(['postgres:', 'postgresql:'].includes(target.protocol))
  assert(['127.0.0.1', 'localhost'].includes(target.hostname))
  assert.equal(target.port, '55322')
  assert.equal(target.search, '')
  assert.equal(target.hash, '')
  assert(new RegExp(`^binturong_domain_proof_${mode}_[a-f0-9]{24}$`).test(process.argv[3]))
  assert.equal(target.pathname, `/${process.argv[3]}`)
  const { getPayload, createLocalReq } = await import('payload')
  const { default: config } = await import('../../src/payload.config.ts')
  const { migrations } = await import('../../src/migrations/index.ts')
  const { generatePasswordSaltHash } =
    await import('../../node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js')
  const { authenticateLocalStrategy } =
    await import('../../node_modules/payload/dist/auth/strategies/local/authenticate.js')
  const payload = await getPayload({ config })
  const pool = payload.db.pool
  let exitCode = 0

  async function capture(columns) {
    const tables =
      columns ??
      (
        await pool.query(
          "select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
        )
      ).rows
    const grouped = Object.groupBy(tables, ({ table_name }) => table_name)
    const rows = {}
    for (const [table, fields] of Object.entries(grouped)) {
      assert(/^[a-z0-9_]+$/.test(table))
      const names = fields.map(({ column_name }) => {
        assert(/^[a-z0-9_]+$/.test(column_name))
        return `"${column_name}"`
      })
      rows[table] = (await pool.query(`select ${names.join(',')} from "${table}" order by id`)).rows
    }
    return { columns: tables, rows }
  }
  async function preserved(before) {
    const after = await capture(before.columns)
    for (const table of Object.keys(before.rows).filter(
      (table) => table !== 'payload_migrations',
    )) {
      assert.deepEqual(after.rows[table], before.rows[table], `Preserved ${table}`)
    }
  }

  try {
    assert.equal(
      (await pool.query('select current_database() as name')).rows[0].name,
      process.argv[3],
    )
    assert.equal(migrations.length, 10)
    let baseline, predecessor, userID
    if (mode === 'populated') {
      await payload.db.migrate({ migrations: migrations.slice(0, 1) })
      const credentials = await generatePasswordSaltHash({
        collection: payload.collections.users.config,
        isPasswordAuthenticated: true,
        password: 'synthetic-migration-password',
      })
      userID = (
        await pool.query(
          "insert into users (email,salt,hash) values ('synthetic-migration@example.invalid',$1,$2) returning id",
          [credentials.salt, credentials.hash],
        )
      ).rows[0].id
      const postID = (
        await pool.query(
          "insert into posts (title,slug,_status) values ('Synthetic existing Post','synthetic-existing-post','published') returning id",
        )
      ).rows[0].id
      await pool.query(
        "insert into posts_rels (parent_id,path,users_id) values ($1,'authors',$2)",
        [postID, userID],
      )
      baseline = await capture()
      await payload.db.migrate({ migrations: migrations.slice(0, 8) })
      await preserved(baseline)
      const orgID = (
        await pool.query(
          "insert into organizations (name,kind,slug,_status) values ('Synthetic predecessor source','usg','synthetic-predecessor-source','published') returning id",
        )
      ).rows[0].id
      const officeID = (
        await pool.query(
          "insert into offices (name,slug,organization_id,_status) values ('Synthetic predecessor office','synthetic-predecessor-office',$1,'draft') returning id",
          [orgID],
        )
      ).rows[0].id
      const fileID = (
        await pool.query(
          "insert into documents (title,organization_id,state) values ('Synthetic sealed file',$1,'pending') returning id",
          [orgID],
        )
      ).rows[0].id
      const recordID = (
        await pool.query(
          "insert into issuances (title,slug,organization_id,issuing_office_id,main_document_id,type,series_year,document_number,_status) values ('Synthetic retained record','synthetic-retained-record',$1,$2,$3,'memorandum',2026,'  Ab-001  ','draft') returning id",
          [orgID, officeID, fileID],
        )
      ).rows[0].id
      await pool.query(
        "insert into _issuances_v (parent_id,version_title,version_slug,version_organization_id,version_main_document_id,version_type,version_series_year,version_document_number,latest,updated_at,created_at) values ($1,'Synthetic retained history','synthetic-retained-record',$2,$3,'memorandum',2026,'  Ab-001  ',true,now(),now())",
        [recordID, orgID, fileID],
      )
      const beforeNumberAdoption = await capture()
      await payload.db.migrate({ migrations: migrations.slice(0, 9) })
      await preserved(beforeNumberAdoption)
      assert.equal(
        (await pool.query('select normalized_number from issuances where id=$1', [recordID]))
          .rows[0].normalized_number,
        'ab-001',
      )
      assert.equal(
        (
          await pool.query(
            'select version_normalized_number from _issuances_v where parent_id=$1',
            [recordID],
          )
        ).rows[0].version_normalized_number,
        'ab-001',
      )
      predecessor = await capture()
      const req = await createLocalReq({}, payload)
      await assert.rejects(
        payload.db.drizzle.transaction(async (db) => {
          await migrations[9].up({ db, payload, req })
          throw new Error('Synthetic failure after additive DDL')
        }),
        /Synthetic failure after additive DDL/,
      )
      assert.deepEqual(await capture(), predecessor)
      console.info('PASS atomic additive migration rollback')
    }
    await payload.db.migrate({ migrations })
    const history = (await pool.query('select * from payload_migrations order by id')).rows
    assert.equal(history.length, 10)
    await payload.db.migrate({ migrations })
    assert.deepEqual(
      (await pool.query('select * from payload_migrations order by id')).rows,
      history,
    )
    console.info('PASS ten migrations and repeat no-op')
    if (predecessor) {
      await preserved(baseline)
      await preserved(predecessor)
      assert.deepEqual(history.slice(0, 9), predecessor.rows.payload_migrations)
      const user = (await pool.query('select * from users where id=$1', [userID])).rows[0]
      assert.equal(user.role, 'editor')
      assert(
        await authenticateLocalStrategy({ doc: user, password: 'synthetic-migration-password' }),
      )
      assert.equal(
        (await pool.query("select '/posts/' || slug as route from posts")).rows[0].route,
        '/posts/synthetic-existing-post',
      )
      assert.equal(
        (await pool.query('select version_title from _issuances_v')).rows[0].version_title,
        'Synthetic retained history',
      )
      console.info('PASS credentials, IDs, relationships, URLs and retained history')
    }
    const orgID = (
      await pool.query(
        "insert into organizations (name,slug,kind) values ('Synthetic constraint source','synthetic-constraint-source','usg') returning id",
      )
    ).rows[0].id
    await assert.rejects(
      pool.query(
        "insert into organizations (name,slug,kind) values ('Synthetic duplicate','synthetic-constraint-source','usg')",
      ),
      { code: '23505' },
    )
    await pool.query(
      "insert into issuances (organization_id,type,series_year,document_number,normalized_number) values ($1,'act',2026,'  Ab-001  ','ab-001')",
      [orgID],
    )
    await assert.rejects(
      pool.query(
        "insert into issuances (organization_id,type,series_year,document_number,normalized_number) values ($1,'act',2026,'AB-001','ab-001')",
        [orgID],
      ),
      { code: '23505' },
    )
    await assert.rejects(
      pool.query(
        "insert into offices (name,organization_id) values ('Synthetic missing source',2147483647)",
      ),
      { code: '23503' },
    )
    const tables = (
      await pool.query(
        "select tablename from pg_tables where schemaname='public' and (tablename ~ '^_?(organizations|academic_years|offices|people|activities|issuances|reports|documents)(_|$)')",
      )
    ).rows.map(({ tablename }) => tablename)
    assert(tables.length >= 15)
    const sequences = new Set()
    for (const role of ['anon', 'authenticated']) {
      for (const table of tables) {
        assert.equal(
          (
            await pool.query('select has_table_privilege($1,$2,$3) as allowed', [
              role,
              table,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN',
            ])
          ).rows[0].allowed,
          false,
          `${role}: ${table}`,
        )
        const sequence = (
          await pool.query('select pg_get_serial_sequence($1,$2) as name', [table, 'id'])
        ).rows[0].name
        if (sequence) sequences.add(sequence)
        if (sequence)
          assert.equal(
            (
              await pool.query('select has_sequence_privilege($1,$2,$3) as allowed', [
                role,
                sequence,
                'USAGE,SELECT,UPDATE',
              ])
            ).rows[0].allowed,
            false,
          )
      }
      const client = await pool.connect()
      try {
        for (const statement of [
          'select * from organizations',
          "insert into organizations (name) values ('Denied')",
          "update organizations set name='Denied'",
          'delete from organizations',
        ]) {
          await client.query('begin')
          try {
            await client.query(`set local role "${role}"`)
            await assert.rejects(client.query(statement), { code: '42501' })
          } finally {
            await client.query('rollback')
          }
        }
      } finally {
        client.release()
      }
    }
    console.info(
      `PASS canonical uniqueness, foreign keys and restricted roles (${tables.length} tables, ${sequences.size} sequences)`,
    )
    console.info(`Verified domain tables: ${tables.sort().join(', ')}`)
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    await payload.destroy()
  }
  // The installed adapter retains a checked-out migration client after destroy.
  process.exit(exitCode)
}
