/**
 * Unicode script analysis for hosts (homographs and mixed scripts) with the native script
 * property escapes `\p{Script=…}` (research R2). No dependency, deterministic.
 */
const SCRIPTS = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Armenian',
  'Georgian',
  'Hebrew',
  'Arabic',
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Bopomofo',
  'Thai',
  'Devanagari',
  'Bengali',
  'Tamil',
  'Ethiopic',
  'Cherokee',
] as const;

const PATTERNS = SCRIPTS.map((name) => [name, new RegExp(`^\\p{Script=${name}}$`, 'u')] as const);

/** Combinations that browsers allow in one label (Chrome IDN policy): CJK writing systems. */
const ALLOWED_MIXES: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['Latin', 'Han', 'Hiragana', 'Katakana']),
  new Set(['Latin', 'Han', 'Bopomofo']),
  new Set(['Latin', 'Han', 'Hangul']),
];

/** Letters of other scripts that render like Latin letters. */
const LATIN_LOOKALIKES = new Set([...'аеорсухіјѕԁӏһԛԝүɡοαικνρτυχ']);

export function scriptsOf(label: string): Set<string> {
  const found = new Set<string>();
  for (const char of label) {
    if (!/\p{L}/u.test(char)) continue;
    found.add(PATTERNS.find(([, re]) => re.test(char))?.[0] ?? 'Other');
  }
  return found;
}

export function isMixedScript(label: string): boolean {
  const scripts = scriptsOf(label);
  if (scripts.size <= 1) return false;
  return !ALLOWED_MIXES.some((allowed) => [...scripts].every((s) => allowed.has(s)));
}

/** A whole label written in Cyrillic or Greek using only letters that look Latin. */
export function isWholeScriptConfusable(label: string): boolean {
  const scripts = scriptsOf(label);
  if (scripts.size !== 1 || !(scripts.has('Cyrillic') || scripts.has('Greek'))) return false;
  const letters = [...label].filter((c) => /\p{L}/u.test(c));
  return letters.length > 0 && letters.every((c) => LATIN_LOOKALIKES.has(c.toLowerCase()));
}
