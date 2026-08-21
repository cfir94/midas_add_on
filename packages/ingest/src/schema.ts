// Zod v4 is required, not a preference: the SDK's `betaZodOutputFormat`
// resolves `zod` from the package root and calls `z.toJSONSchema`, which does
// not exist on v3. On v3 every extraction fails at request time.
import { z } from 'zod';

/**
 * The extraction schema. It mirrors `ChannelRequest` from core, but is declared
 * separately and deliberately: this one is a contract with a language model, so
 * every field carries a description written for the model, and the enums are
 * spelled out so it cannot invent a value the planner does not understand.
 */

export const INSTRUMENT_TAGS = [
  'kick', 'snare', 'hihat', 'tom', 'floor-tom', 'overhead', 'percussion',
  'cajon', 'darbuka', 'bass-di', 'bass-mic', 'guitar-electric',
  'guitar-acoustic', 'keys', 'strings', 'oud', 'qanun', 'violin', 'woodwind',
  'brass', 'vocal-lead', 'vocal-backing', 'talk-mic', 'playback-di',
  'ambience', 'spare',
] as const;

export const STAGE_ZONES = [
  'drums', 'front-left', 'front-center', 'front-right',
  'upstage-left', 'upstage-center', 'upstage-right', 'foh',
] as const;

export const ExtractedChannel = z.object({
  label: z
    .string()
    .describe(
      'Channel name for the console scribble strip, in English, 12 characters or fewer. ' +
        'Translate Hebrew instrument names ("קלידים" -> "Keys", "כינור" -> "Violin"). ' +
        'Keep numbering from the rider ("Tom 1", "Keys L").',
    ),
  instrument: z
    .enum(INSTRUMENT_TAGS)
    .describe(
      'The sound role, which decides the processing preset. Pick the closest match. ' +
        'Use "talk-mic" for a spoken-word or announcement mic next to an instrument, ' +
        '"playback-di" for backing tracks, and "spare" only when the rider lists a spare line.',
    ),
  sourceType: z
    .enum(['mic', 'di', 'wireless', 'line'])
    .describe(
      'How the signal reaches the stage box. "di" for a DI box, "wireless" for a radio ' +
        'receiver, "line" for a balanced output patched straight in, "mic" otherwise.',
    ),
  micModel: z
    .string()
    .nullable()
    .describe(
      'The microphone or DI written in the rider, verbatim ("SM57", "Beta91", "DI / Open XLR"). ' +
        'Null when the rider does not say.',
    ),
  phantom: z
    .boolean()
    .describe(
      'True when the source needs +48V: condensers, active DIs, and anything the rider ' +
        'explicitly marks as needing phantom. False for dynamics and passive DIs.',
    ),
  stageZone: z
    .enum(STAGE_ZONES)
    .describe(
      'Where the player physically stands, from the AUDIENCE point of view. ' +
        'A stage plot drawing is the best evidence; otherwise infer from the instrument ' +
        '(drums are almost always "drums", a soloist "front-center"). ' +
        'Left and right in a Hebrew rider are usually written from the band looking out — ' +
        'flip them if the rider says so.',
    ),
  shareable: z
    .boolean()
    .describe(
      'True ONLY for a source physically supplied by the venue that other acts will reuse ' +
        'unchanged — a house drum kit, a podium mic. False for anything the band brings ' +
        'or sets up themselves. When unsure, false: an extra channel is cheaper than a wrong merge.',
    ),
  stereoPairKey: z
    .string()
    .nullable()
    .describe(
      'Shared key for two channels forming a stereo pair ("keys", "oh"). Null when mono.',
    ),
  notes: z
    .string()
    .nullable()
    .describe('Anything the technician needs that no other field captures. Null when nothing.'),
  uncertainFields: z
    .array(z.string())
    .describe(
      'Names of the fields above you had to guess at because the rider did not say. ' +
        'These are flagged for the technician to confirm. Be honest — an unflagged guess ' +
        'is worse than a flagged one.',
    ),
});

export const ExtractionResult = z.object({
  bandName: z
    .string()
    .describe('The band or act this rider belongs to, as written in the document.'),
  channels: z
    .array(ExtractedChannel)
    .describe(
      'Every input the rider asks for, in the order the rider lists them. ' +
        'Include spare lines if the rider lists them. Do not invent channels the rider ' +
        'does not mention, and do not drop one because it seems redundant.',
    ),
  monitorsByZone: z
    .array(
      z.object({
        zone: z.enum(STAGE_ZONES),
        count: z.number().int().min(0).describe('Wedges or IEM sends needed in this zone.'),
      }),
    )
    .describe('Monitor sends per stage zone, from the rider or the stage plot.'),
  warnings: z
    .array(z.string())
    .describe(
      'Things the technician should read before trusting this extraction: contradictions ' +
        'in the rider, unreadable regions, options the rider left open ("option A / option B").',
    ),
});

export type ExtractionResult = z.infer<typeof ExtractionResult>;
export type ExtractedChannel = z.infer<typeof ExtractedChannel>;
