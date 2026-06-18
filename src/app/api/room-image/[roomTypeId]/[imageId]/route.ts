import { NextRequest, NextResponse } from "next/server";
import { getQloConfig, basicAuthHeader, QloAppsError } from "@/lib/qloapps-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/room-image/{roomTypeId}/{imageId}
 *
 * Streams a QloApps room-type image through the server so the ws_key stays
 * out of the browser. Use these URLs directly in <img src>.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomTypeId: string; imageId: string }> }
) {
  const { roomTypeId, imageId } = await params;

  if (!/^\d+$/.test(roomTypeId) || !/^\d+$/.test(imageId)) {
    return NextResponse.json({ error: "Invalid image reference" }, { status: 400 });
  }

  let apiUrl: string;
  let apiKey: string;
  try {
    ({ apiUrl, apiKey } = getQloConfig());
  } catch (err) {
    const message = err instanceof QloAppsError ? err.message : "Config error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const target = new URL(`${apiUrl}/api/images/room_types/${roomTypeId}/${imageId}`);
  target.searchParams.set("ws_key", apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        Authorization: basicAuthHeader(apiKey),
        "ngrok-skip-browser-warning": "true",
      },
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "QloApps tidak dapat dihubungi" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Gambar tidak tersedia (${upstream.status})` },
      { status: upstream.status === 200 ? 502 : upstream.status }
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  // QloApps images are immutable per id; cache aggressively at the edge.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
