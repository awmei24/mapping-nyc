// Small helpers shared by the Vercel functions in /api.

/** Origins allowed to call the API, from ALLOWED_ORIGINS (comma-separated).
 * Example: "https://yourname.github.io,http://localhost:8000" */
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** CORS headers for this request, or null if the origin is not allowed.
 * Requests without an Origin header (same-origin, curl) are allowed. */
export function corsHeaders(request) {
  const origin = request.headers.get('origin');
  const base = { Vary: 'Origin' };
  if (!origin) return base;
  const host = request.headers.get('host');
  const sameOrigin = host && new URL(origin).host === host;
  if (!sameOrigin && !allowedOrigins().includes(origin)) return null;
  return {
    ...base,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export function json(body, { status = 200, headers = {}, cacheSeconds = 0 } = {}) {
  const cache = cacheSeconds
    ? `public, max-age=3600, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 7}`
    : 'no-store';
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, ...headers },
  });
}

export function preflight(request) {
  const cors = corsHeaders(request);
  return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
}

export function requireKey() {
  const key = process.env.CENSUS_API_KEY;
  if (!key) throw Object.assign(new Error('Server is missing CENSUS_API_KEY'), { status: 500 });
  return key;
}
