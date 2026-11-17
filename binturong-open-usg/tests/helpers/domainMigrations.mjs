import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { sql } from '@payloadcms/db-postgres'
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
  assert(['55322', '45322', '45323'].includes(target.port))
  assert.equal(target.search, '')
  assert.equal(target.hash, '')
  assert(new RegExp(`^binturong_domain_proof_${mode}_[a-f0-9]{24}$`).test(process.argv[3]))
  assert.equal(target.pathname, `/${process.argv[3]}`)
  const { getPayload, createLocalReq } = await import('payload')
  const { default: config } = await import('../../src/payload.config.ts')
  const { migrations } = await import('../../src/migrations/index.ts')
  const { generatePasswordSaltHash } =
    await import('../../node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js')
  const { resolveNavigation } = await import('../../src/Header/resolveNavigation.ts')
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
  // What the Supabase Data API roles can reach in public. Function EXECUTE also comes from
  // PUBLIC, so it is compared across down() but not required to be false.
  const dataAPIExposure = `
    select c.relkind::text as kind, c.relname as name, c.relrowsecurity as rls, r.rolname as role,
      case c.relkind when 'S' then has_sequence_privilege(r.rolname, c.oid, 'USAGE,SELECT,UPDATE')
        else has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') end as allowed
    from pg_class c cross join pg_roles r
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'S')
      and r.rolname in ('anon', 'authenticated')
    union all
    select 'f', p.proname, false, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    from pg_proc p cross join pg_roles r
    where p.pronamespace = 'public'::regnamespace and r.rolname in ('anon', 'authenticated')
    order by 1, 2, 4`
  const navigationTables = [
    'header',
    'header_nav_items',
    'header_rels',
    'footer',
    'footer_nav_items',
    'footer_rels',
  ]
  async function preserved(before, ignored = []) {
    const after = await capture(before.columns)
    for (const table of Object.keys(before.rows).filter(
      (table) => table !== 'payload_migrations' && !ignored.includes(table),
    )) {
      assert.deepEqual(after.rows[table], before.rows[table], `Preserved ${table}`)
    }
  }

  try {
    assert.equal(
      (await pool.query('select current_database() as name')).rows[0].name,
      process.argv[3],
    )
    // A proof database made with CREATE DATABASE lacks the grants Supabase sets up in its
    // own postgres database. Recreate the postgres-role defaults that hosted Supabase has so
    // every migrated table starts exposed to the Data API roles, as it does there.
    await pool.query(`
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
    `)
    assert.equal(migrations.length, 15)
    let baseline, predecessor, beforeDocumentSessions, beforeNavigation, userID, searchID
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
      searchID = (
        await pool.query(
          "insert into search (title,slug) values ('Synthetic indexed Post','synthetic-existing-post') returning id",
        )
      ).rows[0].id
      await pool.query("insert into search_rels (parent_id,path,posts_id) values ($1,'doc',$2)", [
        searchID,
        postID,
      ])
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
      await payload.db.migrate({ migrations: migrations.slice(0, 10) })
      await preserved(predecessor)
      beforeDocumentSessions = await capture()
      await assert.rejects(
        payload.db.drizzle.transaction(async (db) => {
          await migrations[10].up({ db, payload, req })
          throw new Error('Synthetic failure after document session DDL')
        }),
        /Synthetic failure after document session DDL/,
      )
      assert.deepEqual(await capture(), beforeDocumentSessions)
      await payload.db.drizzle.transaction(async (db) => {
        await migrations[10].up({ db, payload, req })
        await migrations[10].down({ db, payload, req })
      })
      assert.deepEqual(await capture(), beforeDocumentSessions)
      console.info('PASS atomic additive migration rollback')
      await payload.db.migrate({ migrations: migrations.slice(0, 12) })
      await preserved(beforeDocumentSessions)
      const headerID = (await pool.query('insert into header default values returning id')).rows[0]
        .id
      const footerID = (await pool.query('insert into footer default values returning id')).rows[0]
        .id
      await pool.query(
        "insert into header_nav_items (_order,_parent_id,id,link_type,link_url,link_label,link_new_tab) values (1,$1,'legacy-leaf','custom','/legacy-leaf','Legacy leaf',false),(2,$1,'legacy-ref','reference','/stale-stored-url','Legacy ref',true),(3,$1,'legacy-unsafe','custom','javascript:alert(1)','Legacy unsafe',false)",
        [headerID],
      )
      const navPostID = (
        await pool.query("select id from posts where slug='synthetic-existing-post'")
      ).rows[0].id
      await pool.query(
        'insert into header_rels (parent_id,path,posts_id,"order") values ($1,\'navItems.1.link.reference\',$2,1)',
        [headerID, navPostID],
      )
      await pool.query(
        "insert into footer_nav_items (_order,_parent_id,id,link_type,link_url,link_label) values (1,$1,'footer-leaf','custom','/footer-leaf','Footer leaf')",
        [footerID],
      )
      beforeNavigation = await capture()
      await assert.rejects(
        payload.db.drizzle.transaction(async (db) => {
          await migrations[12].up({ db, payload, req })
          throw new Error('Synthetic failure after navigation DDL')
        }),
        /Synthetic failure after navigation DDL/,
      )
      assert.deepEqual(await capture(), beforeNavigation)
      console.info('PASS atomic navigation migration rollback with populated Header rows')
    }
    await payload.db.migrate({ migrations: migrations.slice(0, 14) })
    const beforeLockdown = (await pool.query(dataAPIExposure)).rows
    assert(
      beforeLockdown.some(
        ({ name, role, allowed }) => name === 'users' && role === 'anon' && allowed,
      ),
      'Supabase defaults expose users before the lockdown',
    )
    await payload.db.migrate({ migrations })
    const history = (await pool.query('select * from payload_migrations order by id')).rows
    assert.equal(history.length, 15)
    await payload.db.migrate({ migrations })
    assert.deepEqual(
      (await pool.query('select * from payload_migrations order by id')).rows,
      history,
    )
    console.info('PASS fifteen migrations and repeat no-op')
    const lockedDown = (await pool.query(dataAPIExposure)).rows
    assert.deepEqual(
      lockedDown
        .filter(({ kind, rls }) => ['r', 'p'].includes(kind) && !rls)
        .map(({ name }) => name),
      [],
    )
    assert.deepEqual(
      lockedDown.filter(({ kind, allowed }) => kind !== 'f' && allowed).map(({ name }) => name),
      [],
    )
    const probe = async (db) => {
      await db.execute(sql`create table public.lockdown_probe (id serial primary key)`)
      const result = await db.execute(
        sql`select has_table_privilege('anon','public.lockdown_probe','SELECT') as t, has_sequence_privilege('authenticated','public.lockdown_probe_id_seq','USAGE') as s`,
      )
      return result.rows[0]
    }
    await assert.rejects(
      payload.db.drizzle.transaction(async (db) => {
        assert.deepEqual(await probe(db), { t: false, s: false }, 'new tables start closed')
        throw new Error('Synthetic rollback after lockdown probe')
      }),
      /Synthetic rollback after lockdown probe/,
    )
    await assert.rejects(
      payload.db.drizzle.transaction(async (db) => {
        await migrations[14].down({ db })
        const restored = await db.execute(sql.raw(dataAPIExposure))
        assert.deepEqual(restored.rows, beforeLockdown, 'down() restores the pre-lockdown access')
        assert.deepEqual(await probe(db), { t: true, s: true }, 'down() restores defaults')
        throw new Error('Synthetic rollback after lockdown down review')
      }),
      /Synthetic rollback after lockdown down review/,
    )
    assert.deepEqual((await pool.query(dataAPIExposure)).rows, lockedDown)
    console.info('PASS Data API lockdown, closed defaults and reviewed down()')
    // The last-saved-by migration is additive: existing rows keep their data and the new
    // column starts empty (they show under Drafts, not My drafts). Its down() removes it.
    const editedTables = [
      'pages',
      'posts',
      'organizations',
      'academic_years',
      'offices',
      'people',
      'activities',
      'issuances',
      'reports',
    ]
    for (const table of editedTables) {
      const filled = await pool.query(
        `select count(*)::int as n from "${table}" where last_edited_by_id is not null`,
      )
      assert.equal(filled.rows[0].n, 0, `last_edited_by_id starts empty on ${table}`)
    }
    const columnCount = `select count(*)::int as n from information_schema.columns where column_name in ('last_edited_by_id','version_last_edited_by_id')`
    assert.equal((await pool.query(columnCount)).rows[0].n, 18)
    await assert.rejects(
      payload.db.drizzle.transaction(async (db) => {
        await migrations[13].down({ db })
        const left = await db.execute(sql.raw(columnCount))
        assert.equal(left.rows[0].n, 0, 'down() removes every added column')
        throw new Error('Synthetic rollback after down review')
      }),
      /Synthetic rollback after down review/,
    )
    assert.equal((await pool.query(columnCount)).rows[0].n, 18)
    console.info('PASS last-saved-by additive upgrade and reviewed down()')
    if (predecessor) {
      await preserved(baseline, navigationTables)
      await preserved(predecessor, navigationTables)
      await preserved(beforeDocumentSessions, navigationTables)
      await preserved(beforeNavigation)
      assert.deepEqual(history.slice(0, 9), predecessor.rows.payload_migrations)
      assert.deepEqual(history.slice(0, 10), beforeDocumentSessions.rows.payload_migrations)
      assert.deepEqual(history.slice(0, 12), beforeNavigation.rows.payload_migrations)
      const sealedDoc = (
        await pool.query(
          "select state, verified_at, upload_request_id from documents where title='Synthetic sealed file'",
        )
      ).rows[0]
      assert.deepEqual(sealedDoc, {
        state: 'pending',
        verified_at: null,
        upload_request_id: null,
      })
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
      const indexed = (
        await pool.query(
          'select identifier,identifier_key,summary,published_at,sort_at=created_at as ordered from search where id=$1',
          [searchID],
        )
      ).rows[0]
      assert.deepEqual(indexed, {
        identifier: null,
        identifier_key: null,
        summary: null,
        published_at: null,
        ordered: true,
      })
      console.info('PASS search rows survive additive index fields')
      console.info('PASS credentials, IDs, relationships, URLs and retained history')
      const stored = (
        await pool.query(
          'select id,_order,link_type,link_url,link_label,link_new_tab,section from header_nav_items order by _order',
        )
      ).rows
      assert.deepEqual(
        stored.map(({ id, section }) => [id, section]),
        [
          ['legacy-leaf', null],
          ['legacy-ref', null],
          ['legacy-unsafe', null],
        ],
      )
      assert.equal(stored[2].link_url, 'javascript:alert(1)')
      assert.equal(
        (await pool.query('select count(*)::int as n from header_nav_items_children')).rows[0].n,
        0,
      )
      const global = await payload.findGlobal({ slug: 'header', depth: 1, overrideAccess: false })
      assert.deepEqual(
        resolveNavigation(global).map(({ id, href, newTab }) => [id, href, newTab]),
        [
          ['legacy-leaf', '/legacy-leaf', false],
          ['legacy-ref', '/posts/synthetic-existing-post', true],
        ],
      )
      console.info('PASS legacy Header rows keep IDs, order, stored strings and resolved URLs')
    }
    const authored = await payload.updateGlobal({
      slug: 'header',
      overrideAccess: true,
      context: { disableRevalidate: true },
      data: {
        navItems: [
          {
            section: 'government',
            link: { type: 'custom', label: 'Government', url: '/government' },
            children: [{ link: { type: 'custom', label: 'Offices', url: '/offices' } }],
          },
        ],
      },
    })
    assert.equal(authored.navItems[0].children[0].link.url, '/offices')
    await assert.rejects(
      pool.query(
        "insert into header_nav_items (_order,_parent_id,id,section) values (9,$1,'bad','nonsense')",
        [authored.id],
      ),
      { code: '22P02' },
    )
    const rollback = () =>
      payload.db.drizzle.transaction(async (db) => {
        await migrations[12].down({ db, payload, req: await createLocalReq({}, payload) })
      })
    await assert.rejects(rollback(), /Refusing to drop authored Header section data/)
    await pool.query('delete from header_nav_items_children')
    await assert.rejects(rollback(), /Refusing to drop authored Header section data/)
    console.info('PASS rollback refuses authored section data')
    await pool.query('delete from header_nav_items')
    assert.equal(
      (await pool.query('select count(*)::int as n from header_nav_items_children')).rows[0].n,
      0,
    )
    console.info('PASS authored section links, enum constraint and cascade')
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
    await pool.query(
      "insert into documents (title,organization_id,state,upload_request_id) values ('Synthetic session 1',$1,'pending','1:00000000-0000-4000-8000-000000000001')",
      [orgID],
    )
    await assert.rejects(
      pool.query(
        "insert into documents (title,organization_id,state,upload_request_id) values ('Synthetic duplicate session',$1,'pending','1:00000000-0000-4000-8000-000000000001')",
        [orgID],
      ),
      { code: '23505' },
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
