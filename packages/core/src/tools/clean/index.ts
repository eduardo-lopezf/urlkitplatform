import type { Schema, ToolDefinition } from '../../registry.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { clean, type CleanInput, type CleanResult } from './clean.ts';

export { clean, type CleanInput, type CleanResult, type RemovedItem } from './clean.ts';
export { matchParamRule } from './match.ts';

const input: Schema<CleanInput> = {
  safeParse(data) {
    if (!isRecord(data) || typeof data.url !== 'string') return { success: false };
    if (data.mode !== undefined && data.mode !== 'safe' && data.mode !== 'max')
      return { success: false };
    if (
      data.keep !== undefined &&
      !(Array.isArray(data.keep) && data.keep.every((k) => typeof k === 'string'))
    ) {
      return { success: false };
    }
    return { success: true, data: data as unknown as CleanInput };
  },
};

const output: Schema<CleanResult> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.output === 'string' && typeof data.catalogVersion === 'string'
      ? { success: true, data: data as unknown as CleanResult }
      : { success: false },
};

export const cleanTool: ToolDefinition<CleanInput, CleanResult> = {
  id: 'clean',
  version: '1.0.0',
  runsOn: 'client',
  input,
  output,
  run(value, ctx) {
    if (!ctx.catalog) throw new Error('clean needs the rules catalog in its context');
    return clean({ ...value, catalog: ctx.catalog });
  },
  sendTo: ['parse', 'explain', 'diff', 'inspect'],
  share: {
    // #u=<url>&m=safe|max&k=<param1>,<param2>
    encode: ({ url, mode = 'safe', keep = [] }) =>
      encodeFragment([
        ['u', url],
        ['m', mode],
        ['k', keep.length ? keep.join(',') : undefined],
      ]),
    decode(fragment) {
      const f = decodeFragment(fragment);
      const url = f.get('u');
      if (!url) return null;
      const mode = f.get('m') === 'max' ? 'max' : 'safe';
      const keep = (f.get('k') ?? '').split(',').filter(Boolean);
      return { url, mode, keep };
    },
  },
};
