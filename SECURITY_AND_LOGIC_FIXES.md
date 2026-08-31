# VillaOS PMS — Security & Logic Audit Report

> Audited: 3 Aug 2026  
> Codebase: Next.js 16 + Prisma + Xendit QRIS + Midtrans + QloApps migration  
> Status: **20 issues found** (5 critical, 8 medium, 7 low)

---

## 🔴 CRITICAL — Fix Before Production

### 1. Unauthenticated `/api/xendit/create-qris`
**File:** `src/app/api/xendit/create-qris/route.ts`

Endpoint terima `{ bookingId, amount }` dari client tanpa auth, tanpa rate limit, dan pakai `amount` dari client untuk create Xendit payment request.

**Impact:** Attacker bisa generate unlimited QRIS sessions untuk booking manapun, dan specify amount sendiri (bisa lebih kecil dari tagihan).

**Fix:**
- [ ] Hapus `amount` dari body request — ambil dari `booking.totalAmount` di DB
- [ ] Validasi booking exists & status `PENDING_PAYMENT`
- [ ] Tambah rate limit: 10 req/min per IP via `rateLimit()` dari `@/lib/rate-limit`
- [ ] Return 429 kalau rate limit exceeded

---

### 2. `/api/xendit/check-status` — No Rate Limit
**File:** `src/app/api/xendit/check-status/route.ts`

GET `?payment_request_id=pr-xxx` tanpa auth, tanpa rate limit. Attacker bisa poll status payment request manapun dan enumerate booking activity.

**Fix:**
- [ ] Tambah rate limit: 30 req/min per IP

---

### 3. `/api/xendit/simulate` — No Rate Limit
**File:** `src/app/api/xendit/simulate/route.ts`

Meskipun ada `isTestMode()` guard (bagus), tidak ada rate limit. Bisa di-spam untuk generate noise di webhook event table & audit log.

**Fix:**
- [ ] Tambah rate limit: 10 req/min per IP

---

### 4. Booking PII Leak via GET `/api/bookings?code=...`
**File:** `src/app/api/bookings/route.ts` (GET handler)

GET `?code=TARU-XXXXXX` return full booking details (guest name, email, phone, specialRequests) tanpa auth. Booking code cuma 6 karakter alphanumeric — bukan brute-force proof.

**Impact:** Siapapun yang tau booking code (dari URL leak, referrer, screenshot) bisa akses PII tamu.

**Fix:**
- [ ] Strip PII dari GET response — hanya return: `bookingCode`, `checkIn`, `checkOut`, `nights`, `guests`, `status`, `villaName`, `totalAmount`, `currency`
- [ ] Jangan return: `guestName`, `email`, `phone`, `specialRequests`
- [ ] POST handler tetap unchanged

---

### 5. Mock Payment Provider Usable in Production
**File:** `src/lib/payment.ts`, `src/app/api/bookings/route.ts`, `src/app/api/submit-booking/route.ts`

Kalau `PAYMENT_PROVIDER` tidak di-set (default: `"mock"`), booking creation tetap works di production dengan mock payment. README bilang "Never expose with mock" tapi tidak ada enforced check di code.

**Fix:**
- [ ] Buat helper `assertNotMockInProduction()` di `src/lib/payment.ts` — throw error kalau `PAYMENT_PROVIDER=mock` (atau unset) DAN `NODE_ENV=production`
- [ ] Call helper di awal POST handler `/api/bookings` dan `/api/submit-booking`

---

### 6. Rate Limiter Broken in Production
**File:** `src/lib/rate-limit.ts` (line 5)

```typescript
if (process.env.NODE_ENV !== "production") globalBuckets.villaosRateLimits = buckets;
```

Di production, `globalThis.villaosRateLimits` tidak di-set → setiap request buat Map baru → **rate limiter tidak berfungsi sama sekali di production**.

**Fix:**
- [ ] Hapus `NODE_ENV` conditional — always set `globalBuckets.villaosRateLimits = buckets`
- [ ] Add comment: "Single-instance in-memory limiter. For multi-instance deployments, consider Redis/Upstash."

---

## 🟡 MEDIUM — Logic & Business Issues

### 7. Race Condition in Booking Creation
**File:** `src/app/api/submit-booking/route.ts` (line 116-138)

Pattern "create booking → allocate unit → delete if fail" tidak atomic. Kalau server crash antara create dan delete, booking yatim tanpa inventory stuck di DB.

**Fix:**
- [ ] Wrap booking creation + unit allocation dalam `prisma.$transaction(async (tx) => { ... })`
- [ ] Pakai `tx` (transaction client) untuk semua DB ops di dalam block
- [ ] Hapus manual `prisma.booking.delete()` — rollback otomatis kalau allocation gagal
- [ ] Apply fix yang sama di `/api/bookings/route.ts` POST handler kalau ada pattern sama

---

### 8. `getRateQuote` Fallback to `pricePerNight` — Revenue Leak
**File:** `src/lib/rates.ts` (line 34)

```typescript
price: byDate.get(dateKey(date))?.price ?? villa.pricePerNight,
```

Kalau tidak ada `DailyRate` untuk tanggal tertentu, fallback ke reguler price. Staff lupa set peak season rate → booking terjadi dengan harga reguler → revenue leak.

**Fix:**
- [ ] Tambah optional param `options?: { requireDailyRate?: boolean }` ke `getRateQuote`
- [ ] Kalau `requireDailyRate=true`, throw error kalau ada date tanpa daily rate
- [ ] Default behavior (fallback) tetap unchanged untuk backwards compat
- [ ] Add comment explaining the risk of fallback

---

### 9. `/api/bookings` POST Uses Insecure `Math.random()`
**File:** `src/app/api/bookings/route.ts`

Booking code generation pakai `Math.random()` — tidak cryptographically secure, predictable. `/api/submit-booking` sudah pakai `randomBytes(4)` dari `node:crypto` (benar).

**Fix:**
- [ ] Replace `Math.random()` dengan `randomBytes` dari `node:crypto`
- [ ] Match pattern dari `/api/submit-booking/route.ts`
- [ ] Konsolidasi `generateBookingCode()` ke satu shared function kalau memungkinkan

---

### 10. No Email Verification (Skip — Out of Scope)
Booking creation tidak verify email. Guest input email sembarang. Tapi ini butuh infra email service — **skip untuk sekarang**.

- [ ] *Skip — requires email service infrastructure*

---

### 11. `expireStaleBookings` Only Called Lazily
**File:** `src/lib/bookings.ts`, `src/app/api/health/route.ts`

Stale bookings hanya di-expire saat ada request ke availability/booking endpoint. Kalau tidak ada traffic, stale bookings tetap block inventory.

**Fix:**
- [ ] Call `expireStaleBookings()` di `/api/health` endpoint (dalam try/catch, tidak affect health status)
- [ ] Setup uptime monitor (UptimeRobot, etc.) yang hit `/api/health` setiap 5-10 menit
- [ ] Atau setup Vercel Cron / external cron

---

### 12. Night Audit Missing Stale Booking Cleanup
**File:** `src/app/admin/control/actions.ts`

Night audit menghitung exceptions tapi tidak auto-expire stale pending bookings atau release inventory untuk no-shows.

**Fix:**
- [ ] Call `expireStaleBookings()` di awal night audit function
- [ ] Import dari `@/lib/bookings`

---

### 13. Refund Not Amount-Validated Against Payments
**File:** `src/app/admin/control/actions.ts` — `postRefund` function

Hanya cek `amount < 1` dan `reason` tidak kosong. Tidak cek apakah refund melebihi total payments yang masuk. Staff bisa post refund lebih besar dari yang sudah dibayar guest.

**Fix:**
- [ ] Sebelum process refund, hitung total payments received (sum `PAYMENT` - sum `REFUND` dari folio entries)
- [ ] Kalau `amount > remaining balance`, throw error: "Refund amount exceeds total payments received"
- [ ] Pakai existing `folioBalance()` function atau query folio entries directly

---

## 🟢 LOW — Hardening & Best Practices

### 14. CSRF Protection Verification
**File:** `next.config.ts`

Next.js 16 punya built-in CSRF protection untuk server actions, tapi verify tidak di-disable.

**Fix:**
- [ ] Check `next.config.ts` — kalau ada `csrf: false` atau similar override, remove
- [ ] Kalau tidak ada config, add comment confirming built-in protection is active

---

### 15. Session Token Not Rotated on Role Change
**File:** `src/app/admin/control/actions.ts`

Saat staff role diubah, session yang sudah exist tetap valid sampai expiry (12 jam). `setStaffActive` dan `resetStaffPassword` sudah revoke sessions (bagus), tapi **role change** tidak.

**Fix:**
- [ ] Di function `updateStaffRole` (atau `updateStaff`), revoke all sessions: `prisma.staffSession.deleteMany({ where: { staffId } })`
- [ ] Follow pattern yang sudah ada di `setStaffActive`

---

### 16. Audit Log Missing Read Access to Sensitive Data
**File:** `src/app/admin/control/actions.ts`

Beberapa operasi read-heavy (viewing folio, viewing reports) tidak di-audit. Untuk compliance, perlu capture read access ke sensitive data.

**Fix:**
- [ ] Di `getFolio` function, add `writeAudit({ action: "folio:read", entityType: "booking", entityId: bookingId })` setelah retrieve
- [ ] Consider adding untuk reports access juga

---

### 17. No Input Sanitization on Special Requests / Notes
**Files:** `src/app/api/submit-booking/route.ts`, `src/app/api/bookings/route.ts`, `src/app/admin/control/actions.ts`

`specialRequests` dan `internalNotes` disimpan raw ke DB. Stored XSS risk di admin panel kalau tidak di-escape saat display.

**Fix:**
- [ ] Buat file baru `src/lib/sanitize.ts` dengan helper `sanitizeText(text, maxLength)`:
  - Strip HTML tags: `text.replace(/<[^>]*>/g, "")`
  - Truncate to `maxLength` (2000 untuk specialRequests, 5000 untuk internalNotes)
  - Trim whitespace
- [ ] Apply ke `specialRequests` di kedua booking POST handlers
- [ ] Apply ke `internalNotes` di admin actions

---

### 18. No Rate Limit on Availability Check
**Files:** `src/app/api/check-availability/route.ts`, `src/app/api/availability/route.ts`

Availability check tidak ada rate limit. Attacker bisa spam check untuk enumerate availability — competitive intelligence atau resource drain.

**Fix:**
- [ ] Tambah rate limit: 60 req/min per IP ke kedua endpoints

---

### 19. No Content Length Limit on `specialRequests`
Handled by Fix 17 (truncation in `sanitizeText`).

- [ ] *Covered by Fix 17*

---

### 20. SQLite Foreign Key Enforcement
**File:** `src/lib/prisma.ts`

SQLite tidak enforce foreign keys by default. Prisma parameterizes queries (no SQL injection), tapi FK constraints tidak aktif di SQLite mode.

**Fix:**
- [ ] Di `src/lib/prisma.ts`, setelah PrismaClient init, add (dalam try/catch):
  ```typescript
  if (process.env.DATABASE_URL?.startsWith("file:")) {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
  ```
- [ ] PostgreSQL mode (production) sudah enforce FK by default — no change needed

---

## ✅ What's Already Good

- **Password hashing:** scrypt, proper params, timing-safe comparison, per-user salt
- **Account lockout:** 5 failed attempts → 15 min lockout
- **Session management:** httpOnly, sameSite, secure in prod, SHA-256 hashed token, revocable
- **Webhook verification:** timing-safe token comparison (Xendit), SHA-512 signature (Midtrans)
- **Webhook idempotency:** event ID + payload hash dedup
- **Payment amount validation:** webhook checks `data.amount === booking.totalAmount`
- **Idempotency:** `Idempotency-Key` header support, `providerRef` unique constraint
- **Double-booking prevention:** DB-level `@@unique([roomUnitId, stayDate])`
- **Rate restrictions:** CTA/CTD, stop-sell, min-stay enforced server-side
- **RBAC:** 6 roles dengan permission matrix, enforced via `requireStaff()`
- **Audit trail:** Immutable audit log dengan before/after JSON, IP, user-agent
- **CSP headers:** Comprehensive Content-Security-Policy di `next.config.ts`
- **Booking amount server-calculated:** `getRateQuote()` dari stored daily rates, bukan browser input

---

## Summary Table

| # | Priority | Issue | File | Effort |
|---|----------|-------|------|--------|
| 1 | 🔴 Critical | Unauth `/create-qris` — client controls amount | `api/xendit/create-qris/route.ts` | Low |
| 2 | 🔴 Critical | No rate limit on `/check-status` | `api/xendit/check-status/route.ts` | Trivial |
| 3 | 🔴 Critical | No rate limit on `/simulate` | `api/xendit/simulate/route.ts` | Trivial |
| 4 | 🔴 Critical | PII leak via GET `/api/bookings` | `api/bookings/route.ts` | Low |
| 5 | 🔴 Critical | Mock payment in production | `lib/payment.ts` + 2 routes | Low |
| 6 | 🔴 Critical | Rate limiter broken in production | `lib/rate-limit.ts` | Trivial |
| 7 | 🟡 Medium | Race condition in booking creation | `api/submit-booking/route.ts` | Medium |
| 8 | 🟡 Medium | Revenue leak from rate fallback | `lib/rates.ts` | Low |
| 9 | 🟡 Medium | Insecure `Math.random()` booking code | `api/bookings/route.ts` | Low |
| 10 | 🟡 Medium | No email verification | — | *Skip* |
| 11 | 🟡 Medium | Stale booking cleanup only lazy | `api/health/route.ts` | Low |
| 12 | 🟡 Medium | Night audit missing cleanup | `admin/control/actions.ts` | Low |
| 13 | 🟡 Medium | Refund over-payment possible | `admin/control/actions.ts` | Low |
| 14 | 🟢 Low | CSRF verification | `next.config.ts` | Trivial |
| 15 | 🟢 Low | Session not rotated on role change | `admin/control/actions.ts` | Low |
| 16 | 🟢 Low | Audit log missing read access | `admin/control/actions.ts` | Low |
| 17 | 🟢 Low | No input sanitization (XSS) | Multiple + new `lib/sanitize.ts` | Low |
| 18 | 🟢 Low | No rate limit on availability | `api/check-availability/route.ts` | Trivial |
| 19 | 🟢 Low | No content length limit | *Covered by #17* | — |
| 20 | 🟢 Low | SQLite FK enforcement | `lib/prisma.ts` | Trivial |

**Top 3 sebelum production launch:** #1 (unauth QRIS), #4 (PII leak), #6 (rate limiter)
