import { randomUUID } from 'node:crypto';
import type { Band, ChannelRequest, EventInfo, Inventory, MegapatchPlan, StageZone } from '@stagepatch/core';

/**
 * One event being planned: its gear, its bands, what was extracted from their
 * riders, and the plan derived from all of it.
 */
export interface EventRecord {
  id: string;
  event: EventInfo;
  inventory: Inventory;
  bands: Band[];
  requests: ChannelRequest[];
  monitorsByZone: Partial<Record<StageZone, number>>;
  /** Warnings from extraction, kept per band so the UI can attribute them. */
  warnings: { bandId: string; message: string }[];
  /** Present once planning has run. Edits from the UI are written back here. */
  plan?: MegapatchPlan;
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory storage. Deliberately an interface with a trivial implementation:
 * everything above it is written against `EventStore`, so swapping in a real
 * database later touches this file only.
 */
export interface EventStore {
  create(event: EventInfo, inventory: Inventory): EventRecord;
  get(id: string): EventRecord | undefined;
  list(): EventRecord[];
  update(id: string, patch: Partial<Omit<EventRecord, 'id' | 'createdAt'>>): EventRecord;
  delete(id: string): boolean;
}

export class MemoryEventStore implements EventStore {
  private readonly events = new Map<string, EventRecord>();

  create(event: EventInfo, inventory: Inventory): EventRecord {
    const now = new Date().toISOString();
    const record: EventRecord = {
      id: randomUUID(),
      event,
      inventory,
      bands: [],
      requests: [],
      monitorsByZone: {},
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(record.id, record);
    return record;
  }

  get(id: string): EventRecord | undefined {
    return this.events.get(id);
  }

  list(): EventRecord[] {
    return [...this.events.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  update(id: string, patch: Partial<Omit<EventRecord, 'id' | 'createdAt'>>): EventRecord {
    const existing = this.events.get(id);
    if (!existing) throw new Error(`No event ${id}`);
    const updated: EventRecord = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.events.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.events.delete(id);
  }
}
