# Core Postgres and Auth

Hosted project: **astra-industries** (`mrhxfmtofvrgfaikllfw`), US East / North Virginia.
Organization: **astra-industries** (`dzvwumsgnlminyfgplww`), newly created using the default Free plan.

[Project dashboard](https://supabase.com/dashboard/project/mrhxfmtofvrgfaikllfw)

## CLI

```sh
npm install
npx supabase login
npx supabase link --project-ref mrhxfmtofvrgfaikllfw
npx supabase db push --dry-run
npx supabase db push
npx supabase db query --linked --file supabase/tests/core-ownership.sql
```

The CLI is pinned as a development dependency. Local link details and database connection caches in `.temp/` are ignored. Supply a database password through the CLI prompt or `SUPABASE_DB_PASSWORD` when needed. The provisioned password on the initial Windows workstation is stored in Windows Credential Manager under service `astra-industries-supabase`, username `postgres`; it is not stored in the repository. It can also be reset through the Supabase dashboard.

## Schema

- `public.assets`: owner-scoped asset metadata, unique by owner and content-derived asset key.
- `public.scenes`: owner-scoped versioned JSON documents for room dimensions, instance references/transforms, and animation settings.
- Ownership references `auth.users`. Authenticated clients can create/read/update/delete only their own rows. Anonymous database access is revoked; timestamps are maintained by triggers.
- The ownership test exercises two transaction-local users and database roles, checks cross-user isolation and owner CRUD, then rolls back everything. It does not test an end-to-end Auth signup/login flow.

Postgres and Auth are core (#12). S3-compatible object storage is a separate feature (#13); no buckets are created, and the local Storage services are disabled. Local `config.toml` settings have not been pushed to the hosted Auth service. Configure the final Vercel Site URL and redirect URLs when wiring frontend authentication.

The app currently continues to use its existing IndexedDB library. The frontend Auth/session UI and cloud save/load adapters remain to be implemented under #12. Database tables alone do not enable cloud persistence. Binary CAD/geometry and GIF previews belong to #13 rather than these metadata tables.

Free-plan quotas include 500 MB database size, 1 GB object storage, and 5 GB egress; inactive free projects may be paused after a week. Keep binary geometry out of metadata JSON. Creating this project did not request a paid plan, paid compute size, or add-on.
