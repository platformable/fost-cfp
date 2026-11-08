// Shared handling for the integration API under /api/v1/: Bearer API keys, scopes, the 600-per-minute
// limit, JSON errors and cursors. Route files stay thin and call apiRoute().
import { authenticate, rateLimit, type ApiKey } from './api-keys';

export type ErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'method_not_allowed' | 'rate_limited' | 'invalid_request';
const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, forbidden: 403, not_found: 404, method_not_allowed: 405, rate_limited: 429, invalid_request: 400,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public headers: Record<string, string> = {}) { super(message); }
}

export const apiError = (code: ErrorCode, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error: { code, message } }, { status: STATUS[code], headers });

export const notFound = (what: string) => new ApiError('not_found', `No ${what} with that id.`);

// Returned by a handler that created something: answered with 201 instead of 200.
export class Created {
  constructor(public body: unknown) {}
}

const WRITE_METHODS =new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Checks the key, its scope and the rate limit, then runs the handler. Errors become JSON.
export async function apiRoute(req: Request, handler: (key: ApiKey) => Promise<unknown>): Promise<Response> {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!m) throw new ApiError('unauthorized', 'An API key is required. Send it as "Authorization: Bearer <key>". Organisers create keys under Organise → Integrations.');
    const key = await authenticate(m[1]);
    if (!key) throw new ApiError('unauthorized', 'This API key is not valid or has been revoked.');
    const wait = rateLimit(key.id);
    if (wait) throw new ApiError('rate_limited', 'Too many requests: the limit is 600 per minute per key.', { 'Retry-After': String(wait) });
    if (WRITE_METHODS.has(req.method) && key.scope !== 'read-write') throw new ApiError('forbidden', 'This API key can only read data.');
    const body = await handler(key);
    // A handler that created something returns new Created(body) to answer 201.
    if (body instanceof Created) return Response.json(body.body, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.code, err.message, err.headers);
    console.error(err);
    return Response.json({ error: { code: 'server_error', message: 'Something went wrong.' } }, { status: 500 });
  }
}

export const PAGE_SIZE_MAX = 100;

export function pageSize(params: URLSearchParams): number {
  const raw = params.get('limit');
  if (raw === null) return PAGE_SIZE_MAX;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > PAGE_SIZE_MAX) throw new ApiError('invalid_request', `limit must be a whole number from 1 to ${PAGE_SIZE_MAX}.`);
  return n;
}

export const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function decodeCursor<T>(raw: string | null, check: (v: any) => boolean): T | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (check(v)) return v as T;
  } catch { /* fall through */ }
  throw new ApiError('invalid_request', 'The cursor is not valid. Use next_cursor from the previous page.');
}

export function isoTime(raw: string | null, name: string): string | undefined {
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new ApiError('invalid_request', `${name} must be an ISO 8601 time, such as 2027-01-01T00:00:00Z.`);
  }
  return raw;
}

export function wholeNumber(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new ApiError('not_found', 'No record with that id.');
  return Number(raw);
}
