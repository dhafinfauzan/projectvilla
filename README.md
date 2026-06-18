# The Taru Villas — Ubud, Bali

Luxury private villa resort website with a full booking system, built with
Next.js. Bilingual (English / Bahasa Indonesia), fully responsive, with
scroll animations, parallax, Ken Burns hero slideshow, and snap scrolling.

## Tech stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** — custom theme (forest green / cream / gold)
- **Framer Motion** — scroll reveals, parallax, page transitions, lightbox
- **Prisma + SQLite** — booking database (switch to PostgreSQL for production)

## Getting started

```bash
npm install
cp .env.example .env
npm run db:setup     # create the SQLite database and seed the villas
npm run dev          # http://localhost:3000
```

## Pages

| Route | Description |
| --- | --- |
| `/` | Home — hero slideshow, villas, experiences, gallery marquee |
| `/villas` | Villa listing |
| `/villas/[slug]` | Villa detail with photo grid and sticky booking panel |
| `/gallery` | Filterable masonry gallery with lightbox |
| `/experiences` | Spa, dining, culture, yoga |
| `/contact` | Contact info, map, message form |
| `/booking` | 4-step booking flow (villa → dates → details → confirm) |
| `/booking/confirmation` | Booking confirmation by code |
| `/admin` | Booking dashboard (gated by `ADMIN_KEY`, see below) |

SEO routes `/sitemap.xml` and `/robots.txt` are generated automatically
(`src/app/sitemap.ts`, `src/app/robots.ts`); set `NEXT_PUBLIC_APP_URL` so
they emit the right domain. The favicon is the monogram at `src/app/icon.svg`.

## Booking system

- `GET /api/villas` — list villas with prices
- `GET /api/availability?villa=&checkIn=&checkOut=` — check unit availability
- `POST /api/bookings` — create a booking (`PENDING_PAYMENT`), returns a
  payment redirect URL; totals are computed server-side
- `GET /api/bookings?code=` — booking details for the confirmation page
- `POST /api/payment/webhook` — gateway webhook marks bookings
  `CONFIRMED` / `CANCELLED` (signature-verified)

### Booking hold & auto-expiry

An unpaid booking holds its dates for **60 minutes**
(`BOOKING_HOLD_MINUTES` in `src/lib/bookings.ts`). Stale holds are expired
lazily whenever availability is checked, a booking is created, or the admin
page loads — no cron job required. Payment sessions are created with the
same window, so the gateway invoice and the hold expire together.

### Payment gateways (Midtrans / Xendit)

Both gateways are fully implemented in `src/lib/payment.ts` — pick one,
fill in the keys, and you're live. The default `PAYMENT_PROVIDER="mock"`
skips payment and goes straight to the confirmation page (development only).

**Midtrans (Snap):**

1. Set in `.env`: `PAYMENT_PROVIDER="midtrans"`, `MIDTRANS_SERVER_KEY`
   (Dashboard → Settings → Access Keys). Sandbox is used unless
   `MIDTRANS_IS_PRODUCTION="true"`.
2. Set the Payment Notification URL (Dashboard → Settings → Configuration)
   to `https://<your-domain>/api/payment/webhook`.
3. Webhook signatures are verified with
   `sha512(order_id + status_code + gross_amount + server_key)`.

**Xendit (Invoice):**

1. Set in `.env`: `PAYMENT_PROVIDER="xendit"`, `XENDIT_SECRET_KEY`, and
   `XENDIT_CALLBACK_TOKEN` (Dashboard → Settings → Webhooks).
2. Point the *Invoices paid* webhook at
   `https://<your-domain>/api/payment/webhook`.
3. Webhooks are verified via the `x-callback-token` header.

### Admin dashboard

`/admin?key=<ADMIN_KEY>` lists every booking with status, guest, dates, and
revenue stats. Set `ADMIN_KEY` in `.env` to enable it (it is disabled when
unset). The page is excluded from robots.txt and search indexing. Swap the
key gate for real auth (NextAuth/Clerk) when staff accounts are needed.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel — Next.js is detected
   automatically.
2. SQLite does not persist on serverless. Switch `provider` in
   `prisma/schema.prisma` to `postgresql`, create a database (Vercel
   Postgres / Neon / Supabase), and set `DATABASE_URL` in Vercel →
   Project → Settings → Environment Variables.
3. Add the other env vars: `NEXT_PUBLIC_APP_URL=https://<your-domain>`,
   `ADMIN_KEY`, and the payment gateway vars from `.env.example`.
4. Seed once from your machine:
   `DATABASE_URL=<prod url> npx prisma db push && DATABASE_URL=<prod url> npx prisma db seed`.
5. Point the payment gateway webhook at the production domain (see above).

## QloApps integration (optional backend)

This repo can source rooms, availability, and bookings from a
[QloApps](https://qloapps.com) PMS instead of the built-in Prisma store. The
QloApps admin/PMS is used as-is — these routes are a thin server-side proxy
so the QloApps API key never reaches the browser.

**Setup** — put your QloApps webservice details in `.env.local` (gitignored):

```bash
QLOAPPS_API_URL=https://your-qloapps-host        # ngrok URL in dev; changes on restart
QLOAPPS_API_KEY=your-webservice-key
# Optional overrides:
QLOAPPS_ID_HOTEL=1                                # hotel/property id (default 1)
QLOAPPS_BOOKING_STATUS=1                          # confirm valid codes via schema=synopsis
QLOAPPS_PAYMENT_STATUS=0
```

**Middleware routes** (all server-side; key read from `process.env`):

| Route | Method | QloApps call |
| --- | --- | --- |
| `/api/room-types` (`?id=` for one) | GET | `GET /api/room_types` |
| `/api/check-availability` | POST | `POST /api/hotel_ari` (XML body) |
| `/api/submit-booking` | POST | `POST /api/bookings` (XML body) |
| `/api/room-image/{roomTypeId}/{imageId}` | GET | streams `GET /api/images/room_types/...` |

Shared logic lives in `src/lib/qloapps-client.ts` (Basic-Auth header, JS→XML
builder, fetch wrapper with explicit errors for unreachable host, 302
shop_url redirect, bad key, and non-JSON responses).

> **Image note:** room images are proxied through `/api/room-image/...` rather
> than linking QloApps' image URL directly — a direct URL would embed the
> `ws_key` in the browser, defeating the whole point of the proxy.

**Demo page:** `/rooms` lists QloApps room types, checks availability for a
date range, and submits a pending booking — wired to all three routes. The
existing villa site (`/villas`, `/booking`) still runs on Prisma; merge the
flows once the live QloApps backend is verified.

**Testing locally** (QloApps reachable from your machine):

1. Open `http://localhost:3000/api/room-types` — should return room JSON.
2. `curl -X POST localhost:3000/api/check-availability -H 'Content-Type: application/json' -d '{"date_from":"2026-07-10","date_to":"2026-07-13","adults":2}'`
3. POST to `/api/submit-booking`, then check the QloApps admin for the new booking.

## Photos

All photography is hot-linked from [Unsplash](https://unsplash.com) under the
Unsplash license (free for commercial use). Replace the URLs in
`src/lib/villas.ts` with real property photos before launch.
