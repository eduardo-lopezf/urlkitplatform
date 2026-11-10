import { describe, expect, it } from 'vitest';
import { suggestTool } from '../../src/tools/suggest.ts';

describe('suggestTool (home input)', () => {
  it('suggests the cleaner for one URL', () => {
    expect(suggestTool('https://ejemplo.com/?utm_source=x')).toEqual({
      tool: 'clean',
      urls: ['https://ejemplo.com/?utm_source=x'],
    });
  });

  it('suggests the diff for two URLs', () => {
    expect(suggestTool('https://a.example/1\nhttps://a.example/2')).toEqual({
      tool: 'diff',
      urls: ['https://a.example/1', 'https://a.example/2'],
    });
  });

  it('suggests the inspector for known shorteners', () => {
    for (const url of [
      'https://bit.ly/3abc',
      'http://t.co/xyz',
      'tinyurl.com/abc',
      'https://lnkd.in/e123',
    ]) {
      expect(suggestTool(url)?.tool, url).toBe('inspect');
    }
    expect(suggestTool('https://bitly.com.ejemplo.com/x')?.tool).toBe('clean');
  });

  it('returns null for empty input and keeps unparseable input for the cleaner to explain', () => {
    expect(suggestTool('   ')).toBeNull();
    expect(suggestTool('https://exa<mple.com')?.tool).toBe('clean');
  });
});
