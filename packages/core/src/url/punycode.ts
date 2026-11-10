// The ES module build of `punycode` ships no types, and importing plain `punycode` in Node would
// load the deprecated built-in module instead of the npm package.
// @ts-expect-error -- untyped module; the signature is declared below
import { toUnicode as untypedToUnicode } from 'punycode/punycode.es6.js';

export const toUnicode: (input: string) => string = untypedToUnicode;
