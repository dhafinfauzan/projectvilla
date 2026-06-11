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

## Booking system

- `GET /api/villas` — list villas with prices
- `GET /api/availability?villa=&checkIn=&checkOut=` — check unit availability
- `POST /api/bookings` — create a booking (`PENDING_PAYMENT`), returns a
  payment redirect URL; totals are computed server-side
- `GET /api/bookings?code=` — booking details for the confirmation page
- `POST /api/payment/webhook` — gateway webhook marks bookings
  `CONFIRMED` / `CANCELLED`

### Connecting a payment gateway

The integration point is `src/lib/payment.ts`. By default the **mock**
gateway redirects straight to the confirmation page. To go live:

1. Set `PAYMENT_PROVIDER=midtrans` (or `xendit`) plus the API keys in `.env`
   — see `.env.example`.
2. Implement `createMidtransSession` / `createXenditSession` in
   `src/lib/payment.ts` (outlines with API calls are already in the file).
3. Point the gateway's notification/webhook URL at `/api/payment/webhook`
   and add signature verification (notes in the route file).

### Production database

Change `provider` in `prisma/schema.prisma` to `postgresql` and set
`DATABASE_URL` accordingly, then run `npx prisma db push && npx prisma db seed`.

## Photos

All photography is hot-linked from [Unsplash](https://unsplash.com) under the
Unsplash license (free for commercial use). Replace the URLs in
`src/lib/villas.ts` with real property photos before launch.
