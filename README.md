# The Taru Villas + VillaOS

One Next.js application for the public villa website, direct booking engine,
and VillaOS property-management workspace. VillaOS is the primary PMS; QloApps
is retained only as a migration and rollback source.

## What is included

- Public room search, server-side rate quoting, physical-inventory allocation,
  and QRIS/payment-gateway checkout.
- Operator desk for arrivals, departures, reservations, room assignment,
  walk-ins, room status, and housekeeping.
- Control Center for daily rates and restrictions, folios, payments/refunds,
  maintenance, night audit, invoices, management reports, QloApps migration,
  staff roles, audit logs, backups, health, pilot, and cutover controls.
- Database-level `room + stay date` uniqueness to prevent double allocation.
- Individual staff sessions, account lockout, server-side permissions, and an
  immutable operational audit trail.
- SQLite local profile plus generated PostgreSQL schema and initial migration.

## Local start

```bash
npm install
cp .env.example .env
npm run db:setup
npm run admin:bootstrap   # only when no active OWNER exists
npm run dev
```

Open:

- Public website: `http://localhost:3000`
- VillaOS operations: `http://localhost:3000/admin`
- Control Center: `http://localhost:3000/admin/control`
- Health check: `http://localhost:3000/api/health`

`npm run admin:bootstrap` creates a random local owner password and saves it to
`outputs/VillaOS_LOCAL_LOGIN.txt` with owner-only file permissions. If
`ADMIN_EMAIL` and `ADMIN_KEY` are set, `npm run db:setup` instead seeds that
owner account directly.

## Main operator surfaces

| Surface | Capability |
| --- | --- |
| `/admin` | Today, reservations, modify/cancel/no-show, check-in/out, room board, housekeeping, walk-in |
| `/admin/control` → Rates | BAR daily price, minimum stay, CTA/CTD, stop-sell |
| `/admin/control` → Finance | Folio charges, manual payments, refunds, balance, printable invoice |
| `/admin/control` → Maintenance | Work order, priority, assignment, automatic out-of-order room blocking |
| `/admin/control` → Night audit | Close business day, exceptions, occupancy and revenue snapshot |
| `/admin/control` → Reports | Occupancy, revenue pace, source/status mix, CSV exports |
| `/admin/control` → Migration | QloApps CSV dry-run, validation, idempotent commit, external-ID mapping, cutover mode |
| `/admin/control` → Team | Staff accounts, roles, password reset, session revocation, disable/enable |
| `/admin/control` → System | Audit trail, verified local backups, runtime health |

## Roles

`OWNER`, `MANAGER`, `FRONT_DESK`, `HOUSEKEEPING`, `FINANCE`, and `VIEWER` are
enforced on the server. Hiding a button is not treated as authorization.

## Database commands

```bash
npm run db:setup             # local SQLite schema + seed
npm run backup               # timestamped SQLite backup + SHA-256
npm run verify               # business invariants
npm run db:postgres:prepare  # regenerate provider-specific Prisma schema
npm run db:postgres:migrate  # deploy checked-in PostgreSQL migration
npm run db:postgres:seed     # seed property, rooms, owner and settings
```

For a clean production seed set `SEED_DEMO_DATA="false"`. The post-install
generator automatically selects the SQLite or PostgreSQL Prisma profile from
the `DATABASE_URL` scheme.

## QloApps migration contract

Download `/templates/qloapps-bookings-import.csv` or use the Control Center.
Required columns are:

```text
qlo_booking_id,booking_code,villa_slug,room_code,check_in,check_out,
guest_name,email,phone,guests,total_amount,status,source,payment_ref
```

Always run a dry-run first. A batch with invalid rows cannot be committed.
Committed external IDs are mapped so rerunning the same batch does not create
duplicates. `PMS_BACKEND="qloapps"` remains the emergency compatibility mode;
`PMS_BACKEND="local"` is VillaOS.

## Payments and webhooks

Supported payment profiles are mock development, Midtrans, Xendit Invoice, and
Xendit QRIS Payment Requests. Totals are calculated from stored daily rates,
not browser input. Booking writes accept an `Idempotency-Key` header, reserve
physical room-nights, and are rate-limited. Webhooks verify signatures/tokens,
store event hashes, reject event-ID payload changes, validate amounts, and post
the successful transaction into the guest ledger.

Never expose the public app with `PAYMENT_PROVIDER="mock"` in production.

## Validation

```bash
npm run lint
npm run build
npm run verify
```

The full installation, operations, security, migration, backup, PostgreSQL,
pilot, cutover, and rollback guide is in
`outputs/VillaOS_IMPLEMENTATION_AND_OPERATIONS_GUIDE_v1.0.md`.
