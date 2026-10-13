/**
 * Visitors often name a product or a need ("buy diapers", "medicine for a headache") rather than a
 * store. The room descriptions are provenance text, so the embedding alone rarely connects a
 * product to the kind of store that sells it. These rules add that knowledge before embedding and
 * give rooms whose name or aliases identify such a place a small boost so the right store stands
 * out. The boost is lexical on purpose: boosting every "shopping" room would push unrelated
 * shops past the relevance cutoff in malls that have no suitable store.
 */
import type { Room } from './types';

export interface Need {
  /** Text to embed: the original query plus the kinds of places that serve the need. */
  text: string;
  /** Rooms whose name, aliases, or category match get a score boost. */
  keywords?: RegExp;
  /** Short label for interface copy, e.g. "baby products". */
  label?: string;
  /** True for amenities such as wifi or parking that a map may not model at all. */
  facility?: boolean;
}

const needRules: {
  pattern: RegExp;
  label: string;
  places: string;
  keywords: RegExp;
  /** An amenity a demo map may simply not model; say so instead of offering a random shop. */
  facility?: boolean;
}[] = [
  {
    // Restrooms are a facility: when a demo map has none, say so instead of offering a shop.
    pattern: /\b(restrooms?|toilets?|bathrooms?|washrooms?|comfort rooms?|cr|wc|loo|lavatory)\b/,
    label: 'restrooms',
    places: 'restroom toilet washroom comfort room',
    keywords: /restroom|toilet|washroom|bathroom|comfort room|\bcr\b/,
    facility: true,
  },
  {
    pattern:
      /\b(diapers?|nappies|baby (?:food|formula|wipes|milk|products?|stuff|clothes|bottle)|formula milk|pacifier|infant|toddler)\b/,
    label: 'baby products',
    places: 'supermarket grocery store drugstore pharmacy department store baby products',
    keywords:
      /supermarket|grocer|hypermarket|drug|pharmacy|department|baby|kids|retail|mall gallery/,
  },
  {
    // Snacks and drinks are sold by food courts, cafés, and bakeries as well as supermarkets, so a
    // mall without a supermarket still has an answer.
    pattern:
      /\b(snacks?|chips|crisps|candy|candies|chocolates?|cookies|biscuits|pastry|pastries|bread|donuts?|doughnuts?|drinks?|beverages?|bottled water|water|soda|juice|thirsty|something to (?:eat|drink)|quick bite)\b/,
    label: 'snacks and drinks',
    places: 'food court snack bar convenience store cafe bakery supermarket',
    keywords:
      /food|snack|caf[eé]|coffee|tea|convenience|supermarket|grocer|market|kiosk|baker|pantry|dining|retail/,
  },
  {
    pattern:
      /\b(groceries|grocery|vegetables?|fruits?|rice|eggs?|milk|canned goods?|cooking oil|instant noodles|toiletries|shampoo|soap|toothpaste|toothbrush|detergent|tissue|household supplies)\b/,
    label: 'groceries',
    places: 'supermarket grocery store',
    keywords: /supermarket|grocer|hypermarket|market|convenience|bakery|retail/,
  },
  {
    pattern:
      /\b(medicines?|medication|meds|painkillers?|paracetamol|ibuprofen|vitamins?|first aid|band[- ]?aids?|prescription|drugstore|pharmacy|pharmacist|i (?:feel|am) (?:sick|ill|dizzy)|fever|headache|flu|cough|cold medicine|allergy|injured|hurt)\b/,
    label: 'medicine',
    places: 'pharmacy drugstore clinic medicine first aid',
    keywords: /drug|pharmacy|clinic|medical|health|first aid/,
  },
  {
    pattern:
      /\b(doctors?|nurses?|hospital|emergency room|injur(?:y|ed)|bleeding|fainted|unconscious|wound|medical (?:help|attention|emergency))\b/,
    label: 'medical help',
    places: 'clinic first aid medical help pharmacy information desk',
    keywords: /clinic|medical|health|first aid|drug|pharmacy|information/,
    facility: true,
  },
  {
    // Amenities that many demo maps do not model: say so instead of guessing a shop.
    pattern:
      /\b(wi-?fi|internet|charging (?:station|port)|power outlet|socket|parking|car park|lockers?|baggage|lost and found|nursing room|breastfeeding|prayer room|chapel|smoking area|taxi|grab|jeepney|bus (?:stop|station)|lrt|mrt|train station|bike rack)\b/,
    label: 'amenities',
    places: 'information desk customer service lounge',
    keywords: /information|concierge|customer|lounge|reception|parking/,
    facility: true,
  },
  {
    pattern:
      /\b(clothes|clothing|apparel|shirts?|t-?shirts?|polo|pants|trousers|jeans|shorts|dress(?:es)?|skirts?|shoes?|sneakers?|sandals?|slippers|socks|underwear|jackets?|hoodies?|bags?|wallets?|fashion|outfit|something to wear|uniform)\b/,
    label: 'clothing',
    places: 'department store clothing fashion shoes apparel',
    keywords: /department|fashion|clothes|clothing|apparel|boutique|wear|shoes|retail|mall gallery/,
  },
  {
    pattern:
      /\b(phones?|smartphone|cellphone|chargers?|power ?banks?|cables?|laptops?|computers?|macbook|tablets?|ipad|headphones?|earphones?|earbuds|speakers?|tv|television|appliances?|refrigerator|fridge|washing machine|microwave|aircon|air conditioner|gadgets?|cameras?|electronics)\b/,
    label: 'electronics',
    places: 'electronics appliances gadget store phone computer',
    keywords: /electronic|appliance|phone|gadget|tech|computer|laptop|apple|mac|retail/,
  },
  {
    pattern:
      /\b(furniture|sofa|couch|beds?|mattress|pillows?|blankets?|curtains?|kitchenware|plates?|cookware|pots? and pans|home decor|lamps?|home (?:goods|items|stuff))\b/,
    label: 'home goods',
    places: 'home furniture decor store kitchenware',
    keywords: /home|furniture|decor|kitchen|department|retail/,
  },
  {
    pattern: /\b(eyeglasses|glasses|sunglasses|shades|contact lens(?:es)?|eye ?wear|optical)\b/,
    label: 'eyewear',
    places: 'optical shop eyewear sunglasses eyeglasses',
    keywords: /optical|eyewear|sunglass|glasses|department|retail/,
  },
  {
    pattern:
      /\b(makeup|make-up|cosmetics?|lipstick|perfume|fragrance|skincare|skin care|lotion|sunscreen|beauty products?)\b/,
    label: 'beauty products',
    places: 'cosmetics beauty skincare perfume store',
    keywords: /beauty|cosmetic|makeup|perfume|skincare|department|retail/,
  },
  {
    pattern: /\b(books?|novels?|notebooks?|pens?|pencils?|stationery|school supplies|magazines?)\b/,
    label: 'books and stationery',
    places: 'bookstore stationery school supplies library',
    keywords: /book|stationery|library|school|department|retail/,
  },
  {
    pattern: /\b(toys?|lego|board games?|video games?|playstation|nintendo|stuffed animals?)\b/,
    label: 'toys and games',
    places: 'toy store games arcade department store',
    keywords: /toy|arcade|game|play|kids|department|retail/,
  },
  {
    pattern:
      /\b(sports? (?:equipment|gear|wear|shoes)|running shoes|basketball|football|gym (?:wear|clothes)|athletic|jersey)\b/,
    label: 'sports gear',
    places: 'sports store athletic gear sportswear',
    keywords: /sport|athletic|fitness|gym|department|retail/,
  },
  {
    pattern:
      /\b(atm|cash|withdraw|bank|money changer|exchange money|remittance|pay (?:a |my )?bills?)\b/,
    label: 'money services',
    places: 'ATM bank money services information desk',
    keywords: /atm|bank|money|information|concierge/,
    facility: true,
  },
  {
    pattern:
      /\b(haircut|hair ?cut|barber|salon|trim my hair|manicure|pedicure|nails|massage|spa)\b/,
    label: 'grooming',
    places: 'barber salon haircut spa',
    keywords: /barber|salon|hair|spa|nail|massage/,
  },
  {
    pattern:
      /\b(hungry|starving|eat|lunch|dinner|breakfast|brunch|meal|food|restaurant|snack|dessert|ice cream)\b/,
    label: 'food',
    places: 'restaurant food court cafe eat',
    keywords: /food|restaurant|caf[eé]|dining|pantry|eat|kitchen|pizza|burger|steak|grill|bakery/,
  },
  {
    pattern: /\b(movies?|cinema|film|watch (?:a )?(?:show|movie))\b/,
    label: 'cinema',
    places: 'cinema movie theater',
    keywords: /cinema|movie|theat/,
  },
  {
    pattern:
      /\b(lost|lost and found|security|guard|complaint|concierge|customer service|ask (?:someone|staff)|where is the exit|wheelchair rental|stroller rental)\b/,
    label: 'assistance',
    places: 'information desk customer service security',
    keywords: /information|security|concierge|customer|reception|help/,
  },
];

export function expandNeed(query: string): Need {
  const text = query.toLowerCase();
  for (const rule of needRules)
    if (rule.pattern.test(text))
      return {
        text: `${query}. ${rule.places}`,
        keywords: rule.keywords,
        label: rule.label,
        facility: rule.facility,
      };
  return { text: query };
}

/** Rank rooms by cosine similarity, boosting places that lexically serve the recognised need. */
export function rankDestinations(
  embedding: number[],
  rooms: Room[],
  vectors: Record<string, number[]>,
  need: Need = { text: '' },
  boost = 0.1,
) {
  return rooms
    .map((room) => {
      const haystack = `${room.name} ${room.aliases.join(' ')} ${room.category}`.toLowerCase();
      return {
        room,
        score:
          (vectors[room.id] ?? []).reduce((sum, value, i) => sum + value * embedding[i], 0) +
          (need.keywords?.test(haystack) ? boost : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
}
