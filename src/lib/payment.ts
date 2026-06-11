/**
 * Payment gateway integrations.
 *
 * The booking API creates bookings in PENDING_PAYMENT status and then calls
 * `createPaymentSession`. Set PAYMENT_PROVIDER in .env to "midtrans" or
 * "xendit" (plus the matching API keys) to go live; the default "mock"
 * provider skips payment and goes straight to the confirmation page.
 *
 * The webhook route at /api/payment/webhook marks bookings CONFIRMED when
 * the gateway reports a successful charge (with signature verification).
 */

import { BOOKING_HOLD_MINUTES } from "@/lib/bookings";

export type PaymentSession = {
  provider: string;
  /** URL to redirect the guest to (Midtrans Snap / Xendit invoice). */
  redirectUrl: string;
  /** Gateway reference id stored on the booking for reconciliation. */
  reference: string;
};

export type BookingForPayment = {
  bookingCode: string;
  totalAmount: number; // IDR
  guestName: string;
  email: string;
  phone: string;
  villaName: string;
};

/** Public site origin, used for gateway redirect-back URLs. */
function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function createPaymentSession(
  booking: BookingForPayment
): Promise<PaymentSession> {
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";

  switch (provider) {
    case "midtrans":
      return createMidtransSession(booking);
    case "xendit":
      return createXenditSession(booking);
    default:
      // Mock gateway: sends the guest straight to the confirmation page.
      return {
        provider: "mock",
        redirectUrl: `/booking/confirmation?code=${booking.bookingCode}`,
        reference: `MOCK-${booking.bookingCode}`,
      };
  }
}

/**
 * Midtrans Snap — https://docs.midtrans.com/reference/create-snap-token
 * Requires MIDTRANS_SERVER_KEY. Sandbox by default; set
 * MIDTRANS_IS_PRODUCTION=true for live keys.
 */
async function createMidtransSession(
  booking: BookingForPayment
): Promise<PaymentSession> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY is not set");
  }

  const base =
    process.env.MIDTRANS_IS_PRODUCTION === "true"
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com";

  const res = await fetch(`${base}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization:
        "Basic " + Buffer.from(`${serverKey}:`).toString("base64"),
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: booking.bookingCode,
        gross_amount: booking.totalAmount,
      },
      item_details: [
        {
          id: booking.bookingCode,
          price: booking.totalAmount,
          quantity: 1,
          name: `The Taru Villas — ${booking.villaName}`.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: booking.guestName,
        email: booking.email,
        phone: booking.phone,
      },
      // Payment window matches the booking hold so an unpaid booking and
      // its Snap session expire together.
      expiry: { unit: "minutes", duration: BOOKING_HOLD_MINUTES },
      callbacks: {
        finish: `${appUrl()}/booking/confirmation?code=${booking.bookingCode}`,
      },
    }),
  });

  const data = (await res.json()) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };

  if (!res.ok || !data.redirect_url || !data.token) {
    throw new Error(
      `Midtrans error (${res.status}): ${
        data.error_messages?.join("; ") ?? "no redirect_url returned"
      }`
    );
  }

  return {
    provider: "midtrans",
    redirectUrl: data.redirect_url,
    reference: data.token,
  };
}

/**
 * Xendit Invoice — https://developers.xendit.co/api-reference/#create-invoice
 * Requires XENDIT_SECRET_KEY (same key works for test/live mode).
 */
async function createXenditSession(
  booking: BookingForPayment
): Promise<PaymentSession> {
  const secretKey = process.env.XENDIT_SECRET_KEY;
  if (!secretKey) {
    throw new Error("XENDIT_SECRET_KEY is not set");
  }

  const confirmationUrl = `${appUrl()}/booking/confirmation?code=${booking.bookingCode}`;

  const res = await fetch("https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${secretKey}:`).toString("base64"),
    },
    body: JSON.stringify({
      external_id: booking.bookingCode,
      amount: booking.totalAmount,
      currency: "IDR",
      payer_email: booking.email,
      description: `The Taru Villas — ${booking.villaName} (${booking.bookingCode})`,
      customer: {
        given_names: booking.guestName,
        email: booking.email,
        mobile_number: booking.phone,
      },
      // Seconds; matches the booking hold window.
      invoice_duration: BOOKING_HOLD_MINUTES * 60,
      success_redirect_url: confirmationUrl,
      failure_redirect_url: confirmationUrl,
    }),
  });

  const data = (await res.json()) as {
    id?: string;
    invoice_url?: string;
    message?: string;
  };

  if (!res.ok || !data.invoice_url || !data.id) {
    throw new Error(
      `Xendit error (${res.status}): ${data.message ?? "no invoice_url returned"}`
    );
  }

  return {
    provider: "xendit",
    redirectUrl: data.invoice_url,
    reference: data.id,
  };
}
