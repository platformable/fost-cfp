// The /api/v1/ read endpoints. Every object comes from the payload builder in payloads.ts, so API
// reads have the same shape as webhook payloads. Route files under src/app/api/v1/ call these.
import { ApiError, apiRoute, Created, decodeCursor, encodeCursor, isoTime, notFound, pageSize, wholeNumber } from './api';
import { importFromApi, readApiBody } from './imports';
import {
  committeePayload, conferencePayloadByIdOrSlug, listConferencePayloads, listProposalPayloads,
  proposalPayloadById, speakerPayloadById, VISIBLE_STATUSES,
} from './payloads';

type Params = Record<string, string>;
type Handler = (req: Request, params: Params) => Promise<unknown>;
// Next.js passes catch-all segments as arrays; the handlers here only use single segments.
type RouteContext = { params: Promise<any> };

// Exports for a route file: GET runs `get`; other methods go through the same key and scope checks
// (so a read key gets 403), then get 405 because no write endpoints exist yet.
export function v1(get: Handler) {
  const run = (req: Request, ctx: RouteContext, h: Handler) =>
    apiRoute(req, async () => h(req, ((await ctx?.params) ?? {}) as Params));
  const noWrites: Handler = async () => { throw new ApiError('method_not_allowed', 'This endpoint only supports GET.'); };
  return {
    GET: (req: Request, ctx: RouteContext) => run(req, ctx, get),
    POST: (req: Request, ctx: RouteContext) => run(req, ctx, noWrites),
    PUT: (req: Request, ctx: RouteContext) => run(req, ctx, noWrites),
    PATCH: (req: Request, ctx: RouteContext) => run(req, ctx, noWrites),
    DELETE: (req: Request, ctx: RouteContext) => run(req, ctx, noWrites),
  };
}

const conferenceOr404 = async (idOrSlug: string) => {
  const conf = await conferencePayloadByIdOrSlug(idOrSlug);
  if (!conf) throw notFound('conference');
  return conf;
};

export const listConferences: Handler = async (req) => {
  const params = new URL(req.url).searchParams;
  const limit = pageSize(params);
  const after = decodeCursor<{ id: number }>(params.get('cursor'), (v) => Number.isInteger(v?.id));
  const items = await listConferencePayloads({ afterId: after?.id, limit: limit + 1 });
  const more = items.length > limit;
  const page = items.slice(0, limit);
  return { items: page, next_cursor: more ? encodeCursor({ id: page[page.length - 1].id }) : null };
};

export const getConference: Handler = async (_req, { conference }) => conferenceOr404(conference);

export const getCommittee: Handler = async (_req, { conference }) => {
  const conf = await conferenceOr404(conference);
  return { items: await committeePayload(conf.id), next_cursor: null };
};

export const listProposals: Handler = async (req) => {
  const params = new URL(req.url).searchParams;
  const limit = pageSize(params);
  let conferenceId: number | undefined;
  const conference = params.get('conference');
  if (conference) conferenceId = (await conferenceOr404(conference)).id;
  const status = params.get('status') || undefined;
  if (status && !(VISIBLE_STATUSES as string[]).includes(status)) {
    throw new ApiError('invalid_request', `status must be one of: ${VISIBLE_STATUSES.join(', ')}.`);
  }
  const updatedSince = isoTime(params.get('updated_since'), 'updated_since');
  const after = decodeCursor<{ updatedAt: string; id: number }>(params.get('cursor'),
    (v) => typeof v?.updatedAt === 'string' && !Number.isNaN(Date.parse(v.updatedAt)) && Number.isInteger(v?.id));
  // One extra row tells us whether another page exists.
  const { items, cursors } = await listProposalPayloads({ conferenceId, status, updatedSince, after, limit: limit + 1 });
  const more = items.length > limit;
  return { items: items.slice(0, limit), next_cursor: more ? encodeCursor(cursors[limit - 1]) : null };
};

export const getProposal: Handler = async (_req, { id }) => {
  const p = await proposalPayloadById(wholeNumber(id));
  if (!p) throw notFound('proposal');
  return p;
};

export const getSpeaker: Handler = async (_req, { id }) => {
  const s = await speakerPayloadById(wholeNumber(id));
  if (!s) throw notFound('speaker');
  return s;
};

export const unknownPath: Handler = async () => { throw new ApiError('not_found', 'There is no API endpoint at this address.'); };

// POST /api/v1/imports/typeform: the live sync from n8n (read-write key). Same rules as a file import.
export function typeformImportRoute() {
  const notGet: Handler = async () => { throw new ApiError('method_not_allowed', 'Send a Typeform response with POST.'); };
  const run = (req: Request, h: Handler) => apiRoute(req, async () => h(req, {}));
  const post: Handler = async (req) => {
    let body: unknown;
    try { body = await req.json(); } catch { throw new ApiError('invalid_request', 'The body must be JSON.'); }
    const { response, errors } = readApiBody(body);
    if (!response) throw new ApiError('invalid_request', errors.join(' '));
    const result = await importFromApi(response);
    if (result.already_imported) return { already_imported: true, proposals: result.proposals };
    if (result.skipped) return { skipped: result.skipped, unmapped: result.unmapped };
    return new Created({ proposals: result.proposals, topic_exceptions: result.topic_exceptions, unmapped: result.unmapped });
  };
  return {
    POST: (req: Request) => run(req, post),
    GET: (req: Request) => run(req, notGet),
    PUT: (req: Request) => run(req, notGet),
    PATCH: (req: Request) => run(req, notGet),
    DELETE: (req: Request) => run(req, notGet),
  };
}
