/** Character encoding of the analyzed document, as the HTML standard decides it (002/T036). */
import { describe, expect, it } from 'vitest';
import { decodeDocument, sniffEncoding } from '../../src/index.ts';

const ascii = (text: string) => new TextEncoder().encode(text);
const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...ascii(p)] : p)));

describe('sniffEncoding', () => {
  it('a UTF-8 BOM wins over everything', () => {
    const doc = bytes([0xef, 0xbb, 0xbf], '<meta charset="windows-1252">');
    expect(sniffEncoding(doc, 'text/html; charset=iso-8859-2')).toEqual({
      label: 'utf-8',
      source: 'bom',
    });
  });

  it('the Content-Type charset wins over <meta charset>', () => {
    expect(
      sniffEncoding(bytes('<meta charset="utf-8">'), 'text/html; charset="ISO-8859-2"'),
    ).toEqual({ label: 'iso-8859-2', source: 'header' });
  });

  it('finds <meta charset> and <meta http-equiv> within the first 1024 bytes only', () => {
    expect(sniffEncoding(bytes('<head><meta charset=windows-1252>'), 'text/html')).toEqual({
      label: 'windows-1252',
      source: 'meta',
    });
    expect(
      sniffEncoding(
        bytes('<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">'),
        null,
      ),
    ).toEqual({ label: 'shift_jis', source: 'meta' });
    const late = bytes(' '.repeat(1100), '<meta charset="utf-8">');
    expect(sniffEncoding(late, 'text/html')).toEqual({ label: 'windows-1252', source: 'default' });
  });

  it('ignores a charset inside a comment', () => {
    expect(sniffEncoding(bytes('<!-- <meta charset="koi8-r"> --><p>'), null).source).toBe(
      'default',
    );
  });

  it('defaults to windows-1252 without any declaration', () => {
    expect(sniffEncoding(bytes('<p>hola</p>'), 'text/html')).toEqual({
      label: 'windows-1252',
      source: 'default',
    });
  });

  it('falls back to the default for an unknown label, with a warning', () => {
    expect(sniffEncoding(bytes('<p>'), 'text/html; charset=klingon')).toEqual({
      label: 'windows-1252',
      source: 'default',
      warning: { code: 'metadata.unknown-encoding', params: { label: 'klingon' } },
    });
  });
});

describe('decodeDocument', () => {
  it('decodes windows-1252 and Shift_JIS documents', () => {
    expect(decodeDocument(bytes('caf', [0xe9]), 'windows-1252')).toBe('café');
    expect(decodeDocument(new Uint8Array([0x93, 0xfa, 0x96, 0x7b]), 'shift_jis')).toBe('日本');
  });

  it('drops the BOM', () => {
    expect(decodeDocument(bytes([0xef, 0xbb, 0xbf], 'ok'), 'utf-8')).toBe('ok');
  });
});
