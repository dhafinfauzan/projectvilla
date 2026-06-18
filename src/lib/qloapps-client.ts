/**
 * QloApps Webservice client (server-side only).
 *
 * All calls to QloApps go through this module so the API key never reaches
 * the browser. The key + base URL are always read from the environment
 * (QLOAPPS_API_URL / QLOAPPS_API_KEY) and never hardcoded — the ngrok URL
 * changes on every restart during development.
 *
 * QloApps is a PrestaShop fork: standard resources use a `<prestashop>` XML
 * root, while the custom `hotel_ari` (availability/rates/inventory) resource
 * uses a `<qloapps>` root. Responses are requested as JSON (output_format=JSON)
 * so we only need to *build* XML, never parse it.
 */

/** Error type carrying an optional HTTP status, surfaced to API routes. */
export class QloAppsError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "QloAppsError";
    this.status = status;
  }
}

export function getQloConfig(): { apiUrl: string; apiKey: string } {
  const apiUrl = process.env.QLOAPPS_API_URL;
  const apiKey = process.env.QLOAPPS_API_KEY;
  if (!apiUrl || !apiKey) {
    throw new QloAppsError(
      "QLOAPPS_API_URL / QLOAPPS_API_KEY belum di-set. Isi keduanya di .env.local."
    );
  }
  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey };
}

/** HTTP Basic Auth header: username = API key, password = empty. */
export function basicAuthHeader(apiKey: string): string {
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

// ── XML builder ────────────────────────────────────────────────────────────

type XmlValue = string | number | boolean | null | undefined | XmlObject | XmlValue[];
export interface XmlObject {
  [key: string]: XmlValue;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nodeToXml(tag: string, value: XmlValue): string {
  // Skip undefined keys entirely so optional fields don't emit empty tags.
  if (value === undefined) return "";
  // Arrays repeat the element (e.g. multiple <room_occupancy> nodes).
  if (Array.isArray(value)) {
    return value.map((item) => nodeToXml(tag, item)).join("");
  }
  if (value !== null && typeof value === "object") {
    const inner = Object.entries(value)
      .map(([k, v]) => nodeToXml(k, v))
      .join("");
    return `<${tag}>${inner}</${tag}>`;
  }
  if (value === null) return `<${tag}></${tag}>`;
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

/**
 * Build a QloApps/PrestaShop XML request body from a plain object.
 * @param body  the object to serialize (its top-level keys become elements)
 * @param root  "qloapps" for hotel_ari, "prestashop" for standard resources
 */
export function buildXml(body: XmlObject, root: "qloapps" | "prestashop"): string {
  const inner = Object.entries(body)
    .map(([k, v]) => nodeToXml(k, v))
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<${root} xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</${root}>`
  );
}

// ── Fetch wrapper ────────────────────────────────────────────────────────────

type FetchOptions = {
  method?: "GET" | "POST" | "PUT";
  /** XML body for POST/PUT. */
  body?: string;
  /** Extra query params (output_format=JSON and ws_key are added automatically). */
  query?: Record<string, string>;
};

/**
 * Fetch a QloApps resource and return parsed JSON. Throws QloAppsError with a
 * human-readable message for every failure mode (unreachable, 302 shop_url
 * redirect, bad key, non-JSON body) instead of failing silently.
 *
 * @param path resource path beginning with "/api/...".
 */
export async function qloFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { apiUrl, apiKey } = getQloConfig();
  const { method = "GET", body, query } = options;

  const url = new URL(apiUrl + path);
  url.searchParams.set("output_format", "JSON");
  url.searchParams.set("ws_key", apiKey);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      // Detect QloApps' shop_url redirect ourselves instead of following it.
      redirect: "manual",
      headers: {
        Authorization: basicAuthHeader(apiKey),
        Accept: "application/json",
        // Skip ngrok's HTML interstitial so we get the real API response.
        "ngrok-skip-browser-warning": "true",
        ...(body ? { "Content-Type": "text/xml; charset=UTF-8" } : {}),
      },
      body,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new QloAppsError(
      `Tidak bisa menghubungi QloApps di ${apiUrl}. Pastikan QloApps (Docker) dan ngrok aktif, dan QLOAPPS_API_URL sudah diperbarui. (${reason})`
    );
  }

  // QloApps redirects (302) when the requested host is not a registered
  // shop_url — surface this clearly rather than silently following it.
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    const location = res.headers.get("location") ?? "(tidak diketahui)";
    throw new QloAppsError(
      `QloApps domain belum dikonfigurasi dengan benar — request di-redirect (${res.status}) ke ${location}. ` +
        `Tambahkan domain ngrok kamu sebagai Shop URL di QloApps Admin → Preferences → SEO & URLs (Set Shop URL).`,
      res.status
    );
  }

  const text = await res.text();

  if (res.status === 401 || res.status === 403) {
    throw new QloAppsError(
      `API key QloApps ditolak (${res.status}). Periksa QLOAPPS_API_KEY dan pastikan Webservice aktif dengan permission yang benar di QloApps Admin → Advanced Parameters → Webservice.`,
      res.status
    );
  }

  if (!res.ok) {
    throw new QloAppsError(
      `QloApps mengembalikan error ${res.status}: ${text.slice(0, 400)}`,
      res.status
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new QloAppsError(
      `Respons QloApps bukan JSON valid (mungkin halaman peringatan ngrok atau error HTML). Cuplikan: "${snippet}"`
    );
  }
}

/** Flatten a PrestaShop multilang field ([{id, value}] | string) to a string. */
export function flattenLang(field: unknown): string {
  if (field == null) return "";
  if (typeof field === "string") return field;
  if (Array.isArray(field)) {
    const first = field[0] as { value?: string } | string | undefined;
    if (typeof first === "string") return first;
    return first?.value ?? "";
  }
  if (typeof field === "object" && "value" in (field as object)) {
    return String((field as { value?: string }).value ?? "");
  }
  return String(field);
}
