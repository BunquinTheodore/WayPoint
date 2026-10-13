// Building the 30k-entry lookup once per vocabulary instead of per query keeps search instant.
const lookups = new WeakMap<string[], Map<string, number>>();
function lookupFor(vocabulary: string[]) {
  let lookup = lookups.get(vocabulary);
  if (!lookup) {
    lookup = new Map(vocabulary.map((word, i) => [word.trim(), i]));
    lookups.set(vocabulary, lookup);
  }
  return lookup;
}

export function tokenize(text: string, vocabulary: string[], limit = 128) {
  const lookup = lookupFor(vocabulary);
  const basic =
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  const ids = [lookup.get('[CLS]') ?? 101];
  for (const token of basic) {
    const pieces: number[] = [];
    let start = 0;
    let failed = token.length > 100;
    while (start < token.length && !failed) {
      let end = token.length;
      let found: number | undefined;
      while (end > start) {
        const word = (start > 0 ? '##' : '') + token.slice(start, end);
        found = lookup.get(word);
        if (found !== undefined) break;
        end--;
      }
      if (found === undefined) failed = true;
      else {
        pieces.push(found);
        start = end;
      }
    }
    ids.push(...(failed ? [lookup.get('[UNK]') ?? 100] : pieces));
    if (ids.length >= limit - 1) break;
  }
  ids.splice(limit - 1);
  ids.push(lookup.get('[SEP]') ?? 102);
  return {
    input_ids: BigInt64Array.from(ids.map(BigInt)),
    attention_mask: BigInt64Array.from(ids.map(() => 1n)),
    token_type_ids: BigInt64Array.from(ids.map(() => 0n)),
    length: ids.length,
  };
}

export function meanPool(data: Float32Array, mask: BigInt64Array, dimensions = 384): number[] {
  const result = new Array(dimensions).fill(0);
  let count = 0;
  for (let t = 0; t < mask.length; t++) {
    if (!mask[t]) continue;
    count++;
    for (let d = 0; d < dimensions; d++) result[d] += data[t * dimensions + d];
  }
  for (let d = 0; d < dimensions; d++) result[d] /= Math.max(1, count);
  const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
  return result.map((v) => v / Math.max(norm, 1e-12));
}
