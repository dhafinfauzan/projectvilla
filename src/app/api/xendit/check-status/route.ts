import { NextRequest, NextResponse } from "next/server";
import { getPaymentRequestStatus } from "@/lib/xendit";

export const dynamic = "force-dynamic";

/**
 * GET /api/xendit/check-status?payment_request_id=pr-xxx
 * Used by the QRIS component to poll for payment completion. Returns just the
 * status so nothing sensitive from Xendit leaks to the client.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("payment_request_id");
  if (!id) {
    return NextResponse.json(
      { error: "payment_request_id wajib diisi" },
      { status: 400 }
    );
  }

  try {
    const status = await getPaymentRequestStatus(id);
    return NextResponse.json({ status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal cek status";
    console.error("[check-status]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
