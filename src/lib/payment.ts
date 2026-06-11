/**
 * Payment gateway abstraction.
 *
 * The booking API creates bookings in PENDING_PAYMENT status and then calls
 * `createPaymentSession`. To go live, implement one of the gateways below and
 * set PAYMENT_PROVIDER in .env. The webhook route at /api/payment/webhook
 * marks bookings CONFIRMED when the gateway reports a successful charge.
 */

export type PaymentSession = {
  provider: string;
  /** URL to redirect the guest to (Midtrans Snap / Xendit invoice / Stripe Checkout). */
  redirectUrl: string;
  /** Gateway reference id stored on the booking for webhook reconciliation. */
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
      // Replace by setting PAYMENT_PROVIDER once a real gateway is configured.
      return {
        provider: "mock",
        redirectUrl: `/booking/confirmation?code=${booking.bookingCode}`,
        reference: `MOCK-${booking.bookingCode}`,
      };
  }
}

async function createMidtransSession(
  _booking: BookingForPayment
): Promise<PaymentSession> {
  // Midtrans Snap integration outline (https://docs.midtrans.com/docs/snap-overview):
  //
  // const res = await fetch("https://app.midtrans.com/snap/v1/transactions", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization:
  //       "Basic " + Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64"),
  //   },
  //   body: JSON.stringify({
  //     transaction_details: {
  //       order_id: booking.bookingCode,
  //       gross_amount: booking.totalAmount,
  //     },
  //     customer_details: {
  //       first_name: booking.guestName,
  //       email: booking.email,
  //       phone: booking.phone,
  //     },
  //   }),
  // });
  // const data = await res.json();
  // return { provider: "midtrans", redirectUrl: data.redirect_url, reference: data.token };
  throw new Error("Midtrans not configured. Set MIDTRANS_SERVER_KEY and implement createMidtransSession.");
}

async function createXenditSession(
  _booking: BookingForPayment
): Promise<PaymentSession> {
  // Xendit Invoice integration outline (https://developers.xendit.co/api-reference/#create-invoice):
  //
  // const res = await fetch("https://api.xendit.co/v2/invoices", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization:
  //       "Basic " + Buffer.from(process.env.XENDIT_SECRET_KEY + ":").toString("base64"),
  //   },
  //   body: JSON.stringify({
  //     external_id: booking.bookingCode,
  //     amount: booking.totalAmount,
  //     payer_email: booking.email,
  //     description: `The Taru Villas — ${booking.villaName} (${booking.bookingCode})`,
  //   }),
  // });
  // const data = await res.json();
  // return { provider: "xendit", redirectUrl: data.invoice_url, reference: data.id };
  throw new Error("Xendit not configured. Set XENDIT_SECRET_KEY and implement createXenditSession.");
}
