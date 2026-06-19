/**
 * Xendit client + QRIS helpers (server-side only).
 *
 * Uses the official xendit-node SDK and the Payment Requests V2 API. The
 * secret key is read from XENDIT_SECRET_KEY and never reaches the browser.
 */

import { Xendit } from "xendit-node";

export function getXenditClient(): Xendit {
  const secretKey = process.env.XENDIT_SECRET_KEY;
  if (!secretKey) {
    throw new Error("XENDIT_SECRET_KEY belum di-set di environment.");
  }
  return new Xendit({ secretKey });
}

export type QrisSession = {
  paymentRequestId: string;
  qrString: string;
  amount: number;
  status: string;
  expiresAt: string | null;
};

/**
 * Creates a one-time QRIS payment request for a booking and returns the
 * qr_string the guest scans. The QloApps booking id is embedded in metadata
 * so the webhook can reconcile the payment back to the booking.
 */
export async function createQrisPaymentRequest(params: {
  bookingId: string | number;
  amount: number;
  checkinDate?: string;
  checkoutDate?: string;
}): Promise<QrisSession> {
  const xnd = getXenditClient();

  let pr;
  try {
    pr = await xnd.PaymentRequest.createPaymentRequest({
      data: {
        referenceId: `booking-${params.bookingId}-${Date.now()}`,
        currency: "IDR",
        amount: Math.round(params.amount),
        paymentMethod: {
          type: "QR_CODE",
          reusability: "ONE_TIME_USE",
          qrCode: { channelCode: "QRIS" },
        },
        metadata: {
          booking_id: String(params.bookingId),
          checkin_date: params.checkinDate ?? "",
          checkout_date: params.checkoutDate ?? "",
        },
      },
    });
  } catch (err) {
    throw new Error(`Xendit menolak request: ${describeXenditError(err)}`);
  }

  const channelProps = pr.paymentMethod?.qrCode?.channelProperties;
  const qrString = channelProps?.qrString;
  if (!qrString) {
    throw new Error("Xendit tidak mengembalikan qr_string untuk QRIS.");
  }

  return {
    paymentRequestId: pr.id,
    qrString,
    amount: pr.amount ?? Math.round(params.amount),
    status: pr.status,
    expiresAt: channelProps?.expiresAt
      ? new Date(channelProps.expiresAt).toISOString()
      : null,
  };
}

/** Extracts a readable message from a xendit-node SDK error. */
function describeXenditError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      errorCode?: string;
      message?: string;
      rawResponse?: unknown;
      status?: number;
    };
    const parts = [
      e.status ? `HTTP ${e.status}` : null,
      e.errorCode,
      e.message,
      e.rawResponse ? JSON.stringify(e.rawResponse) : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return err instanceof Error ? err.message : String(err);
}

/** Returns the current status of a payment request (PENDING / SUCCEEDED / …). */
export async function getPaymentRequestStatus(
  paymentRequestId: string
): Promise<string> {
  const xnd = getXenditClient();
  const pr = await xnd.PaymentRequest.getPaymentRequestByID({ paymentRequestId });
  return pr.status;
}
