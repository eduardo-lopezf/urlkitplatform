/**
 * Message and error codes emitted by the core: the single source of truth (Principio X).
 *
 * Codes are part of the public contract. A published code never changes meaning and is never
 * removed without an announced deprecation; texts for people live in packages/i18n.
 * Structure: `<tool>.<category>.<case>` (docs/arquitectura.md §8).
 *
 * Quota and authentication codes are not here: they belong to the adapter and are declared in
 * packages/contracts/src/errors.ts.
 */
export const CODES = [
  // Errors returned as ToolError.code
  'url.invalid',
  'url.too-long',
  'url.unsupported-scheme',

  // Inspector hop errors (Hop.error). `inspect.blocked` is the generic block; the sub-codes say why.
  'inspect.blocked',
  'inspect.blocked.private-address',
  'inspect.blocked.scheme',
  'inspect.blocked.credentials',
  'inspect.blocked.port',
  'inspect.blocked.unresolvable',
  'inspect.timeout',
  'inspect.tls',
  'inspect.network',
  'inspect.invalid-location',

  // Input and parser warnings (ParsedUrl.warnings)
  'input.multiple-urls',
  'input.scheme-assumed',
  'parse.warning.backslash',
  'parse.warning.control-chars',
  'parse.warning.numeric-ipv4',
  'parse.warning.invalid-encoding',
  'parse.warning.non-special-scheme',

  // Reasons for removing something in Smart Cleaner (CleaningRule.reason)
  'clean.reason.campaign',
  'clean.reason.ad-click',
  'clean.reason.email',
  'clean.reason.analytics',
  'clean.reason.social',
  'clean.reason.affiliate',
  'clean.reason.wrapper',
  'clean.reason.canonical',

  // Explain URL: one code per explained part
  'explain.part.scheme.https',
  'explain.part.scheme.http',
  'explain.part.scheme.dangerous',
  'explain.part.scheme.other',
  'explain.part.userinfo',
  'explain.part.host',
  'explain.part.registrable-domain',
  'explain.part.subdomain',
  'explain.part.port',
  'explain.part.path',
  'explain.part.param.tracking',
  'explain.part.param.functional',
  'explain.part.fragment',

  // Explain URL: signals (informational notices, never a verdict)
  'explain.signal.userinfo-deception',
  'explain.signal.ip-host',
  'explain.signal.homograph',
  'explain.signal.mixed-scripts',
  'explain.signal.excessive-encoding',
  'explain.signal.double-encoding',
  'explain.signal.dangerous-scheme',
  'explain.signal.unusual-port',
  'explain.signal.nested-url',
  'explain.signal.abuse-tld',
] as const;

Object.freeze(CODES);

export type MessageCode = (typeof CODES)[number];

/** Codes the core may return as `ToolError.code`. */
export const ERROR_CODES = ['url.invalid', 'url.too-long', 'url.unsupported-scheme'] as const;
export type CoreErrorCode = (typeof ERROR_CODES)[number];

/** Codes a rule may use as its `reason`. */
export const CLEAN_REASON_CODES = CODES.filter((c) => c.startsWith('clean.reason.'));

export function isMessageCode(value: string): value is MessageCode {
  return (CODES as readonly string[]).includes(value);
}
