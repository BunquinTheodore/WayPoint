/**
 * Filipino and Taglish are common in the demo malls. The models and rules are English-first, so
 * common Filipino words and phrases are translated word-for-word before anything else runs.
 * This is a small lookup, not a translator: it covers how visitors ask for places.
 */
const phrases: [RegExp, string][] = [
  [/\bnasaan ako\b/g, 'where am i'],
  [/\bsaan ako\b/g, 'where am i'],
  [/\bpinakamalapit na\b/g, 'nearest'],
  [/\bmalapit na\b/g, 'nearest'],
  [/\bpaano (?:pumunta|makapunta|makarating) sa\b/g, 'how do i get to'],
  [/\bpapunta sa\b/g, 'to'],
  [/\bpunta sa\b/g, 'go to'],
  [/\bpumunta sa\b/g, 'go to'],
  [/\bgusto ko(?:ng)?\b/g, 'i want'],
  [/\bkailangan ko(?:ng)?\b/g, 'i need'],
  [/\bbumili ng\b/g, 'buy'],
  [/\bikalawang palapag\b/g, '2nd floor'],
  [/\bpangalawang palapag\b/g, '2nd floor'],
  [/\bikatlong palapag\b/g, '3rd floor'],
  [/\bpangatlong palapag\b/g, '3rd floor'],
  [/\bikaapat na palapag\b/g, '4th floor'],
  [/\bunang palapag\b/g, '1st floor'],
  [/\bground palapag\b/g, 'ground floor'],
  [/\bmaraming salamat\b/g, 'thanks'],
  [/\bsalamat po\b/g, 'thanks'],
  [/\bwalang hagdan\b/g, 'no stairs'],
  [/\bayaw ko (?:ng|sa) hagdan\b/g, 'no stairs'],
  [/\bhindi ako makaakyat ng hagdan\b/g, 'i cannot climb stairs'],
];
const words: Record<string, string> = {
  saan: 'where is',
  nasaan: 'where is',
  asan: 'where is',
  nasan: 'where is',
  ang: 'the',
  yung: 'the',
  mga: '',
  po: '',
  ba: '',
  ko: '',
  ka: '',
  kayo: '',
  nga: '',
  lang: '',
  ng: 'of',
  sa: 'to',
  at: 'and',
  o: 'or',
  dito: 'here',
  diyan: 'there',
  doon: 'there',
  cr: 'restroom',
  banyo: 'restroom',
  palikuran: 'restroom',
  kubeta: 'restroom',
  hagdan: 'stairs',
  hagdanan: 'stairs',
  elebeytor: 'elevator',
  labasan: 'exit',
  pasukan: 'entrance',
  kainan: 'restaurant',
  karinderya: 'restaurant',
  pagkain: 'food',
  kain: 'eat',
  kumain: 'eat',
  gutom: 'hungry',
  nagugutom: 'hungry',
  uhaw: 'thirsty',
  nauuhaw: 'thirsty',
  kape: 'coffee',
  tubig: 'water',
  gamot: 'medicine',
  botika: 'pharmacy',
  parmasya: 'pharmacy',
  doktor: 'doctor',
  klinika: 'clinic',
  sinehan: 'cinema',
  sine: 'cinema',
  palengke: 'supermarket',
  grocery: 'supermarket',
  damit: 'clothes',
  sapatos: 'shoes',
  laruan: 'toys',
  libro: 'books',
  selpon: 'phone',
  cellphone: 'phone',
  gupit: 'haircut',
  barbero: 'barber',
  palapag: 'floor',
  taas: 'upstairs',
  itaas: 'upstairs',
  baba: 'downstairs',
  ibaba: 'downstairs',
  malapit: 'near',
  pinakamalapit: 'nearest',
  tulong: 'help',
  tulungan: 'help',
  nawawala: 'lost',
  naliligaw: 'lost',
  sunog: 'fire',
  lindol: 'earthquake',
  salamat: 'thanks',
  sige: 'ok',
  oo: 'yes',
  hindi: 'no',
  wala: 'none',
  meron: 'is there',
  mayroon: 'is there',
  may: 'is there',
  ilan: 'how many',
  ilang: 'how many',
  magkano: 'how much',
  bukas: 'open',
  sarado: 'closed',
  oras: 'time',
  wheelchair: 'wheelchair',
};
const tagalogSignal = new RegExp(
  '\\b(?:' +
    Object.keys(words)
      .filter(
        (word) => !['cr', 'at', 'o', 'may', 'grocery', 'cellphone', 'wheelchair'].includes(word),
      )
      .join('|') +
    ')\\b',
);

/** Translate common Filipino navigation words; unchanged text when no Filipino is detected. */
export function localizeMessage(text: string): { text: string; translated: boolean } {
  const lower = text.toLowerCase();
  const hasPhrase = phrases.some(([pattern]) => new RegExp(pattern.source).test(lower));
  if (!hasPhrase && !tagalogSignal.test(lower)) return { text, translated: false };
  let out = lower;
  for (const [pattern, replacement] of phrases)
    out = out.replace(new RegExp(pattern.source, 'g'), replacement);
  out = out
    .split(/(\s+)/)
    .map((token) => {
      const core = token.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!core || !(core in words)) return token;
      const trailing = /[?!.,]+$/.exec(token)?.[0] ?? '';
      return words[core] + trailing;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: out, translated: out !== lower };
}
