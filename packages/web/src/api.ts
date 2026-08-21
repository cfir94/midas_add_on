import type { Inventory, MegapatchPlan } from '@stagepatch/core';

/** One event as the server stores it. */
export interface EventRecord {
  id: string;
  event: { name: string; date: string; venue: string };
  inventory: Inventory;
  bands: { id: string; name: string; slot: number }[];
  warnings: { bandId: string; message: string }[];
  plan?: MegapatchPlan;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Surface the server's own message — "no plan yet", "extraction failed" —
    // rather than a generic status code the technician cannot act on.
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listEvents: () => fetch('/api/events').then(json<EventRecord[]>),

  getEvent: (id: string) => fetch(`/api/events/${id}`).then(json<EventRecord>),

  createEvent: (event: EventRecord['event'], inventory: Inventory) =>
    fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, inventory }),
    }).then(json<EventRecord>),

  saveInventory: (id: string, inventory: Inventory) =>
    fetch(`/api/events/${id}/inventory`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inventory }),
    }).then(json<MegapatchPlan>),

  uploadRider: (id: string, bandName: string, files: File[]) => {
    const form = new FormData();
    form.append('bandName', bandName);
    for (const file of files) form.append('files', file);
    return fetch(`/api/events/${id}/riders`, { method: 'POST', body: form }).then(
      json<{ extracted: number; warnings: string[]; plan: MegapatchPlan }>,
    );
  },

  savePlan: (id: string, plan: MegapatchPlan) =>
    fetch(`/api/events/${id}/plan`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plan),
    }).then(json<MegapatchPlan>),

  replan: (id: string) =>
    fetch(`/api/events/${id}/plan`, { method: 'POST' }).then(json<MegapatchPlan>),

  exportUrl: (id: string, kind: 'scene' | 'csv' | 'markdown') =>
    `/api/events/${id}/export/${kind}`,
};
