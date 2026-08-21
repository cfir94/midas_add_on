import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ChannelRequest, StageZone } from '@stagepatch/core';
import { ExtractionResult } from './schema.js';

/** A rider as uploaded: a PDF, a photo of a stage plot, or a spreadsheet. */
export interface RiderDocument {
  filename: string;
  mediaType: string;
  /** File bytes. Text formats may also be passed as a string. */
  data: Buffer | string;
}

export interface ExtractOptions {
  /** Defaults to a client resolving credentials from the environment. */
  client?: Anthropic;
  model?: string;
  /** Band id assigned to every extracted request. Defaults to a slug of the band name. */
  bandId?: string;
}

export interface ExtractionOutcome {
  bandId: string;
  bandName: string;
  requests: ChannelRequest[];
  monitorsByZone: Partial<Record<StageZone, number>>;
  /** Everything the model could not resolve. Shown to the technician, never dropped. */
  warnings: string[];
}

const SYSTEM = `You read live-sound technical riders and stage plots and turn them into a structured channel list.

Riders arrive as PDFs, spreadsheet screenshots, and photos of hand-drawn stage plots. They mix Hebrew and English freely, they are inconsistent, and they are often incomplete. Your job is to extract exactly what the document says.

Rules that matter more than completeness:

- Never invent a channel. If the rider lists 14 inputs, return 14, not a tidied-up 16.
- Never drop a channel because it looks redundant. Two talk mics are two channels.
- A stage plot drawing outranks prose for stage positions.
- Hebrew riders often write left and right from the BAND's point of view looking at the audience. The stageZone field is from the AUDIENCE's point of view, so flip them unless the document states its own convention.
- When the rider offers alternatives ("option A: violin, option B: accordion"), extract the first option and put the alternative in warnings.
- Flag every guess in uncertainFields. A technician can check a flagged guess in seconds; an unflagged one reaches the stage.`;

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'band';
}

function documentBlock(doc: RiderDocument): Anthropic.Beta.BetaContentBlockParam {
  const base64 = typeof doc.data === 'string'
    ? Buffer.from(doc.data).toString('base64')
    : doc.data.toString('base64');

  if (doc.mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    };
  }

  if (doc.mediaType.startsWith('image/')) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: doc.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: base64,
      },
    };
  }

  // Spreadsheets and CSVs are converted to text upstream; anything else that
  // reaches here is treated as text rather than silently refused.
  const text = typeof doc.data === 'string' ? doc.data : doc.data.toString('utf8');
  return { type: 'text', text: `Contents of ${doc.filename}:\n\n${text}` };
}

/**
 * Read one band's rider — possibly several files, such as a channel list plus a
 * stage plot — into the channel requests the planner consumes.
 *
 * Anything the model was unsure about arrives flagged rather than hidden: guessed
 * fields land in each request's `confidence` map, and document-level problems in
 * `warnings`.
 */
export async function extractRider(
  documents: RiderDocument[],
  options: ExtractOptions = {},
): Promise<ExtractionOutcome> {
  if (documents.length === 0) {
    throw new Error('extractRider needs at least one document');
  }

  const client = options.client ?? new Anthropic();

  const response = await client.beta.messages.parse({
    model: options.model ?? 'claude-opus-5',
    max_tokens: 16000,
    // No `thinking` parameter: Claude Opus 5 runs adaptive thinking by default,
    // and this SDK version's typings predate the `adaptive` value. Omitting it
    // is both the correct request and the one the types allow.
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          ...documents.map(documentBlock),
          {
            type: 'text',
            text:
              'Extract the channel list from these documents. If more than one document is ' +
              'attached, they describe the same act — combine them, and let the stage plot ' +
              'decide stage positions.',
          },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(ExtractionResult) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `Extraction returned no structured output (stop_reason: ${response.stop_reason}).`,
    );
  }

  return toOutcome(parsed, options.bandId);
}

/**
 * Convert a model response into planner input. Split out from the API call so it
 * can be tested against recorded responses without a network round trip.
 */
export function toOutcome(parsed: ExtractionResult, bandId?: string): ExtractionOutcome {
  const id = bandId ?? slug(parsed.bandName);

  const requests: ChannelRequest[] = parsed.channels.map((ch, i) => ({
    id: `${id}-${i + 1}`,
    bandId: id,
    label: ch.label,
    instrument: ch.instrument,
    sourceType: ch.sourceType,
    micModel: ch.micModel ?? undefined,
    phantom: ch.phantom,
    stageZone: ch.stageZone,
    shareable: ch.shareable,
    stereoPairKey: ch.stereoPairKey ?? undefined,
    notes: ch.notes ?? undefined,
    // A flagged field is a guess. Everything else the rider actually stated.
    confidence: Object.fromEntries(ch.uncertainFields.map((f) => [f, 0.5])),
  }));

  const monitorsByZone: Partial<Record<StageZone, number>> = {};
  for (const entry of parsed.monitorsByZone) {
    monitorsByZone[entry.zone] = entry.count;
  }

  return {
    bandId: id,
    bandName: parsed.bandName,
    requests,
    monitorsByZone,
    warnings: parsed.warnings,
  };
}

/** Fields a technician should confirm before the plan is trusted. */
export function uncertainFields(request: ChannelRequest): string[] {
  return Object.keys(request.confidence ?? {});
}
