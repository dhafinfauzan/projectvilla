import { NextRequest, NextResponse } from "next/server";
import { simulateQrisPayment, isTestMode } from "@/lib/xendit";

export const dynamic = "force-dynamic";

/**
 * POST /api/xendit/simulate  (test mode only)
 * Body: { paymentMethodId, amount }
 *
 * Simulates a successful QRIS payment so the full flow (status → webhook →
 * QloApps paid) can be tested without real money. Disabled on live keys.
 */
export async function POST(req: NextRequest) {
  if (!isTestMode()) {
    return NextResponse.json(
      { error: "Simulasi hanya tersedia di test mode" },
      { status: 403 }
    );
  }

  let body: { paymentMethodId?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { paymentMethodId, amount } = body;
  if (!paymentMethodId || !amount) {
    return NextResponse.json(
      { error: "paymentMethodId dan amount wajib diisi" },
      { status: 400 }
    );
  }

  try {
    await simulateQrisPayment(paymentMethodId, Number(amount));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal simulasi";
    console.error("[simulate]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
