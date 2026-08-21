import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  buildPlan,
  generateScene,
  toCsv,
  toMarkdown,
  M32,
  type Band,
  type EventInfo,
  type Inventory,
  type MegapatchPlan,
  type StageZone,
} from '@stagepatch/core';
import { extractRider, type RiderDocument } from '@stagepatch/ingest';
import { MemoryEventStore, type EventStore } from './store.js';

export interface AppOptions {
  store?: EventStore;
  /**
   * Rider extraction. Injectable so the API can be tested end to end without
   * calling a model — the default is the real extractor.
   */
  extract?: typeof extractRider;
  logger?: boolean;
}

/** 25 MB — comfortably above a rider PDF, well below the API's 32 MB request cap. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const store = options.store ?? new MemoryEventStore();
  const extract = options.extract ?? extractRider;

  const app = Fastify({ logger: options.logger ?? false });
  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 8 } });

  /** Look up an event or answer 404 once, rather than in every handler. */
  function require404(id: string, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
    const record = store.get(id);
    if (!record) {
      reply.code(404).send({ error: `No event ${id}` });
      return undefined;
    }
    return record;
  }

  /**
   * Rebuild the plan from the current requests. Called after anything that
   * changes the inputs, so the stored plan can never drift from them.
   */
  function replan(id: string): MegapatchPlan {
    const record = store.get(id)!;
    const plan = buildPlan({
      event: record.event,
      inventory: record.inventory,
      bands: record.bands,
      requests: record.requests,
      monitorsByZone: record.monitorsByZone,
    });
    store.update(id, { plan });
    return plan;
  }

  app.get('/api/health', async () => ({ ok: true }));

  // --- Events ------------------------------------------------------------

  app.get('/api/events', async () => store.list());

  app.post<{ Body: { event: EventInfo; inventory?: Inventory } }>(
    '/api/events',
    async (request, reply) => {
      const { event, inventory } = request.body ?? {};
      if (!event?.name) {
        return reply.code(400).send({ error: 'event.name is required' });
      }
      const record = store.create(event, inventory ?? defaultInventory());
      return reply.code(201).send(record);
    },
  );

  app.get<{ Params: { id: string } }>('/api/events/:id', async (request, reply) => {
    const record = require404(request.params.id, reply);
    return record ?? undefined;
  });

  app.put<{ Params: { id: string }; Body: { inventory: Inventory } }>(
    '/api/events/:id/inventory',
    async (request, reply) => {
      if (!require404(request.params.id, reply)) return;
      store.update(request.params.id, { inventory: request.body.inventory });
      return replan(request.params.id);
    },
  );

  // --- Rider ingest ------------------------------------------------------

  /**
   * Upload one band's rider. Several files may be attached — a channel list and
   * a stage plot describe the same act and are extracted together.
   */
  app.post<{ Params: { id: string } }>('/api/events/:id/riders', async (request, reply) => {
    const record = require404(request.params.id, reply);
    if (!record) return;

    const documents: RiderDocument[] = [];
    let bandName: string | undefined;
    let slot: number | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        documents.push({
          filename: part.filename,
          mediaType: part.mimetype,
          data: await part.toBuffer(),
        });
      } else if (part.fieldname === 'bandName') {
        bandName = String(part.value);
      } else if (part.fieldname === 'slot') {
        slot = Number(part.value);
      }
    }

    if (documents.length === 0) {
      return reply.code(400).send({ error: 'Attach at least one rider file' });
    }

    let outcome;
    try {
      outcome = await extract(documents, {});
    } catch (error) {
      // Extraction failing is not the same as the event being broken. Say what
      // went wrong and leave the event as it was.
      return reply.code(502).send({
        error: 'Rider extraction failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    const band: Band = {
      id: outcome.bandId,
      name: bandName ?? outcome.bandName,
      slot: slot ?? record.bands.length + 1,
    };

    // Re-uploading a band's rider replaces that band's channels and leaves
    // every other band untouched.
    const bands = [...record.bands.filter((b) => b.id !== band.id), band];
    const requests = [
      ...record.requests.filter((r) => r.bandId !== band.id),
      ...outcome.requests,
    ];
    const monitorsByZone: Partial<Record<StageZone, number>> = { ...record.monitorsByZone };
    for (const [zone, count] of Object.entries(outcome.monitorsByZone)) {
      // Zones shared between bands take the larger requirement.
      const z = zone as StageZone;
      monitorsByZone[z] = Math.max(monitorsByZone[z] ?? 0, count ?? 0);
    }

    store.update(request.params.id, {
      bands,
      requests,
      monitorsByZone,
      warnings: [
        ...record.warnings.filter((w) => w.bandId !== band.id),
        ...outcome.warnings.map((message) => ({ bandId: band.id, message })),
      ],
    });

    const plan = replan(request.params.id);
    return reply.code(201).send({ band, extracted: outcome.requests.length, warnings: outcome.warnings, plan });
  });

  // --- Plan --------------------------------------------------------------

  app.post<{ Params: { id: string } }>('/api/events/:id/plan', async (request, reply) => {
    if (!require404(request.params.id, reply)) return;
    return replan(request.params.id);
  });

  /**
   * Accept the technician's edits to the plan. The plan is stored as given —
   * a technician overriding the planner is the point, not an error — but the
   * requests behind it are left alone so a later replan is still possible.
   */
  app.put<{ Params: { id: string }; Body: MegapatchPlan }>(
    '/api/events/:id/plan',
    async (request, reply) => {
      if (!require404(request.params.id, reply)) return;
      store.update(request.params.id, { plan: request.body });
      return request.body;
    },
  );

  // --- Export ------------------------------------------------------------

  function planOr409(id: string, reply: Parameters<typeof require404>[1]) {
    const record = store.get(id);
    if (!record) {
      reply.code(404).send({ error: `No event ${id}` });
      return undefined;
    }
    if (!record.plan) {
      reply.code(409).send({ error: 'No plan yet — upload a rider first' });
      return undefined;
    }
    return record;
  }

  app.get<{ Params: { id: string } }>('/api/events/:id/export/scene', async (request, reply) => {
    const record = planOr409(request.params.id, reply);
    if (!record) return;
    const filename = `${slugify(record.event.name)}.scn`;
    return reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(generateScene(record.plan!));
  });

  app.get<{ Params: { id: string } }>('/api/events/:id/export/csv', async (request, reply) => {
    const record = planOr409(request.params.id, reply);
    if (!record) return;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${slugify(record.event.name)}.csv"`)
      .send(toCsv(record.plan!));
  });

  app.get<{ Params: { id: string } }>('/api/events/:id/export/markdown', async (request, reply) => {
    const record = planOr409(request.params.id, reply);
    if (!record) return;
    return reply.header('content-type', 'text/markdown; charset=utf-8').send(toMarkdown(record.plan!));
  });

  return app;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
}

/** A plain M32 with no stage box, so a new event is usable before gear is entered. */
function defaultInventory(): Inventory {
  return { console: M32, stageBoxes: [], multicores: [] };
}
