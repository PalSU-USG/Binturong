# binturong-open-usg

The Binturong application: a Payload CMS site on Next.js and PostgreSQL. Setup, scripts, test-database rules and contribution workflow are in the [root README](../README.md).

- Architecture, access rules and publishing invariants: [AGENTS.md](AGENTS.md)
- Local Supabase, migrations and test databases: [docs/local-development.md](../docs/local-development.md)

Quick start, from this directory:

```powershell
npm install
npm run payload -- migrate
npm run dev
```

This needs a configured `.env` and a running local database. The root README explains both.
