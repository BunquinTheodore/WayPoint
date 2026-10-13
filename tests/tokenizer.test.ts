import { describe, it, expect } from 'vitest';
import { tokenize, meanPool } from '../src/tokenizer';
describe('offline BERT preprocessing', () => {
  const vocabulary = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'hello', ',', 'world', 'book', '##s'];
  it('normalizes accents, splits punctuation, and emits WordPiece tokens', () => {
    expect(Array.from(tokenize('Héllo, world books', vocabulary).input_ids)).toEqual([
      2n,
      4n,
      5n,
      6n,
      7n,
      8n,
      3n,
    ]);
  });
  it('uses an unknown token and limits length with a final separator', () => {
    expect(Array.from(tokenize('unknown', vocabulary).input_ids)).toEqual([2n, 1n, 3n]);
    const value = tokenize('hello '.repeat(200), vocabulary);
    expect(value.length).toBe(128);
    expect(value.input_ids.at(-1)).toBe(3n);
  });
  it('ignores masked tokens and normalizes pooled embeddings', () => {
    expect(meanPool(new Float32Array([3, 4, 100, 100]), new BigInt64Array([1n, 0n]), 2)).toEqual([
      0.6, 0.8,
    ]);
  });
});
