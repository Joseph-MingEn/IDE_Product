import { describe, expect, it } from 'vitest';
import { parseToolArgsJson } from '../../src/tools/runToolCommand';

describe('parseToolArgsJson (debug command)', () => {
  it('empty string → {}', () => {
    expect(parseToolArgsJson('')).toEqual({});
    expect(parseToolArgsJson('   ')).toEqual({});
  });

  it('parses object', () => {
    expect(parseToolArgsJson('{"symbol":"Foo"}')).toEqual({ symbol: 'Foo' });
  });

  it('rejects non-object', () => {
    const r = parseToolArgsJson('[]');
    expect(r).toHaveProperty('error');
  });

  it('rejects invalid JSON', () => {
    const r = parseToolArgsJson('{bad');
    expect(r).toHaveProperty('error');
  });
});
