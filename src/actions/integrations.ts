'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createApiKey, revokeApiKey } from '@/lib/api-keys';
import { sendTestEvent } from '@/lib/events';
import { flash, requireRole } from '@/lib/session';
import {
  createEndpoint, deleteEndpoint, getEndpoint, readEndpointForm, regenerateSecret, resendDelivery, setPaused, updateEndpoint,
} from '@/lib/webhooks';

// Secrets and keys are returned to the page once, never stored in a cookie or shown again.
export interface RevealState { errors?: string[]; values?: Record<string, unknown>; secret?: string; id?: number }

const back = (id: number, hash = '') => redirect(`/admin/integrations/endpoints/${id}${hash}`);

export async function createEndpointAction(_prev: RevealState, form: FormData): Promise<RevealState> {
  const me = await requireRole(['admin']);
  const input = readEndpointForm(form);
  const saved = await createEndpoint(input, me.id);
  if (saved.errors.length) return { errors: saved.errors, values: input as unknown as Record<string, unknown> };
  return { secret: saved.secret, id: saved.id };
}

export async function updateEndpointAction(id: number, _prev: RevealState, form: FormData): Promise<RevealState> {
  await requireRole(['admin']);
  const input = readEndpointForm(form);
  const errors = await updateEndpoint(id, input);
  if (errors.length) return { errors, values: input as unknown as Record<string, unknown> };
  await flash('success', 'Endpoint saved.');
  back(id);
  return {};
}

export async function regenerateSecretAction(id: number, _prev: RevealState): Promise<RevealState> {
  await requireRole(['admin']);
  if (!(await getEndpoint(id))) redirect('/admin/integrations');
  return { secret: await regenerateSecret(id), id };
}

export async function pauseEndpointAction(id: number, form: FormData): Promise<void> {
  await requireRole(['admin']);
  const paused = form.get('paused') === '1';
  await setPaused(id, paused);
  await flash('success', paused
    ? 'Endpoint paused. New events are kept and will be sent when you resume it.'
    : 'Endpoint resumed. Events recorded while it was paused are being sent now.');
  back(id);
}

export async function deleteEndpointAction(id: number): Promise<void> {
  await requireRole(['admin']);
  await deleteEndpoint(id);
  await flash('success', 'Endpoint deleted. Nothing more will be sent to it.');
  redirect('/admin/integrations');
}

export async function sendTestEventAction(id: number): Promise<void> {
  await requireRole(['admin']);
  if (!(await getEndpoint(id))) redirect('/admin/integrations');
  await sendTestEvent(id);
  await flash('success', 'Test event queued. It appears in the delivery log below once the worker has sent it.');
  back(id, '#log');
}

export async function resendDeliveryAction(endpointId: number, deliveryId: number): Promise<void> {
  await requireRole(['admin']);
  const ok = await resendDelivery(endpointId, deliveryId);
  await flash(ok ? 'success' : 'error', ok
    ? 'Queued to send again, with the same event id.'
    : 'This event is older than 30 days, so its details have been deleted and it cannot be sent again.');
  back(endpointId, '#log');
}

export async function createApiKeyAction(_prev: RevealState, form: FormData): Promise<RevealState> {
  const me = await requireRole(['admin']);
  const name = String(form.get('name') ?? '').trim();
  const scope = String(form.get('scope') ?? '');
  const created = await createApiKey(name, scope, me.id);
  if (created.errors.length) return { errors: created.errors, values: { name, scope } };
  revalidatePath('/admin/integrations');
  return { secret: created.key, id: created.id };
}

export async function revokeApiKeyAction(id: number): Promise<void> {
  await requireRole(['admin']);
  await revokeApiKey(id);
  await flash('success', 'API key revoked. Requests using it are now refused.');
  redirect('/admin/integrations#keys');
}
