// Integration events: recorded in the same transaction as the change they describe (a transactional
// outbox), with one delivery row per subscribed webhook endpoint. The worker (npm run worker) sends them.
import crypto from 'node:crypto';
import type pg from 'pg';
import { one, query, transaction } from './db';
import { proposalPayloadById, speakerPayloadById } from './payloads';

export const EVENT_TYPES = [
  'speaker.registered',
  'speaker.profile_updated',
  'proposal.submitted',
  'proposal.updated',
  'proposal.withdrawn',
  'proposal.speaker_confirmed',
  'proposal.speaker_declined',
  'email_link.requested',
] as const;
export type EventType = (typeof EVENT_TYPES)[number] | 'test.ping';

export const EVENT_VERSION = 1;
export const NOTIFY_CHANNEL = 'fost_events';

// Plain-English descriptions for the Integrations screens.
export const EVENT_LABELS: Record<EventType, string> = {
  'speaker.registered': 'A speaker creates an account',
  'speaker.profile_updated': 'A speaker changes their profile',
  'proposal.submitted': 'A proposal is submitted (one event per conference)',
  'proposal.updated': 'A speaker edits a proposal',
  'proposal.withdrawn': 'A speaker withdraws a proposal',
  'proposal.speaker_confirmed': 'A speaker confirms their slot',
  'proposal.speaker_declined': 'A speaker declines their slot',
  'email_link.requested': 'A password or invite link needs emailing (n8n sends the email)',
  'test.ping': 'Test event',
};

export interface EventEnvelope {
  id: string;
  type: EventType;
  version: number;
  occurred_at: string;
  data: Record<string, unknown>;
}

// Records an event and queues it for every endpoint subscribed to its type, including paused ones
// (the worker skips those until they are resumed). Must be called with the transaction's client.
export async function recordEvent(db: pg.PoolClient, type: EventType, data: Record<string, unknown>, onlyEndpointId?: number): Promise<string> {
  const id = crypto.randomUUID();
  await query('INSERT INTO events (id, type, version, data) VALUES ($1, $2, $3, $4)', [id, type, EVENT_VERSION, JSON.stringify(data)], db);
  if (onlyEndpointId !== undefined) {
    await query('INSERT INTO webhook_deliveries (event_id, endpoint_id) VALUES ($1, $2)', [id, onlyEndpointId], db);
  } else {
    await query(`INSERT INTO webhook_deliveries (event_id, endpoint_id)
                 SELECT $1, id FROM webhook_endpoints WHERE $2 = ANY(event_types)`, [id, type], db);
  }
  // Delivered to listening workers only when the transaction commits.
  await query(`SELECT pg_notify('${NOTIFY_CHANNEL}', $1)`, [id], db);
  return id;
}

export async function recordProposalEvent(db: pg.PoolClient, type: EventType, proposalId: number, extra: Record<string, unknown> = {}) {
  const proposal = await proposalPayloadById(proposalId, db);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found while recording ${type}`);
  return recordEvent(db, type, { proposal, ...extra });
}

export async function recordSpeakerEvent(db: pg.PoolClient, type: EventType, userId: number, extra: Record<string, unknown> = {}) {
  const speaker = await speakerPayloadById(userId, db);
  if (!speaker) throw new Error(`User ${userId} not found while recording ${type}`);
  return recordEvent(db, type, { speaker, ...extra });
}

// A signed test.ping for one endpoint only, so an organiser can check it before real data flows.
export async function sendTestEvent(endpointId: number): Promise<string> {
  return transaction((db) => recordEvent(db, 'test.ping', { message: 'Test event from FOST Call for Speakers' }, endpointId));
}

export async function getEvent(id: string): Promise<EventEnvelope | null> {
  return one<EventEnvelope>('SELECT id, type, version, occurred_at, data FROM events WHERE id = $1', [id]);
}
