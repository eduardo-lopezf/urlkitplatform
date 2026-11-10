import type { Schema, ToolDefinition } from '../../registry.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { inspect } from './logic.ts';
import type { RedirectChain } from './types.ts';

export * from './logic.ts';
export type * from './types.ts';

const input: Schema<{ url: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.url === 'string'
      ? { success: true, data: { url: data.url } }
      : { success: false },
};

const output: Schema<RedirectChain> = {
  safeParse: (data) =>
    isRecord(data) && Array.isArray(data.hops)
      ? { success: true, data: data as unknown as RedirectChain }
      : { success: false },
};

export const inspectTool: ToolDefinition<{ url: string }, RedirectChain> = {
  id: 'inspect',
  version: '1.0.0',
  runsOn: 'server',
  input,
  output,
  run({ url }, ctx) {
    if (!ctx.fetchHop) throw new Error('inspect needs a network adapter (ctx.fetchHop)');
    return inspect(url, ctx.fetchHop);
  },
  sendTo: ['clean', 'parse', 'explain', 'diff'],
  share: {
    // Opening a shared link fills the input; the inspection still needs an explicit click.
    encode: ({ url }) => encodeFragment([['u', url]]),
    decode(fragment) {
      const url = decodeFragment(fragment).get('u');
      return url ? { url } : null;
    },
  },
};
