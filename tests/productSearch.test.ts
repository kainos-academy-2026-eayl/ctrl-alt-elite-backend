import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLE_PRODUCTS as SAMPLE_PRODUCT_DATA } from '../src/data/sampleProducts';
import { Product } from '../src/models/product';
import {
  findProducts,
  normaliseSearchTerm,
  searchProducts,
} from '../src/models/productSearch';

// The seed catalogue, so these cases match what the frontend's /search shows.
const SAMPLE_PRODUCTS: readonly Product[] = SAMPLE_PRODUCT_DATA.map(
  (details) => new Product(details),
);

function namesFor(term: string): string[] {
  return searchProducts(SAMPLE_PRODUCTS, term).map((p) => p.name);
}

function product(name: string, keywords: string[]): Product {
  return new Product({
    id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    description: '',
    imageUrl: '',
    unitPricePence: 100,
    keywords,
    isInStock: true,
  });
}

/** Small fixed catalogue so the matching rules are tested independently of the sample data. */
const CATALOGUE: readonly Product[] = [
  product('Desk Lamp', ['light']),
  product('Floor Lamp', ['light']),
  product('Desk Fan', ['cooling']),
  product('Laptop Stand', ['computer']),
  product('Wireless Keyboard', ['typing']),
  product('Planter', ['garden']),
  product('Plaster', ['wall']),
  product('Noise-Cancelling Headphones', ['audio']),
];

function catalogueNamesFor(term: string): string[] {
  return findProducts(CATALOGUE, term).products.map((p) => p.name);
}

describe('searchProducts', () => {
  it('matches a product by name', () => {
    assert.deepEqual(namesFor('Desk Lamp'), ['Desk Lamp']);
  });

  it('matches a product by keyword', () => {
    assert.deepEqual(namesFor('coffee'), ['Ceramic Mug']);
  });

  it('is case-insensitive', () => {
    assert.deepEqual(namesFor('CERAMIC'), ['Ceramic Mug']);
  });

  it('matches partial terms and includes out of stock products', () => {
    assert.deepEqual(namesFor('headphone'), [
      'Noise-Cancelling Headphones',
      'Studio Headphones',
    ]);
  });

  it('requires every word to match', () => {
    assert.deepEqual(namesFor('studio headphone'), ['Studio Headphones']);
  });

  it('returns nothing for a blank or unmatched term', () => {
    assert.deepEqual(namesFor('   '), []);
    assert.deepEqual(namesFor('zzzz'), []);
  });

  it('matches the closest product when words are misspelled', () => {
    assert.deepEqual(namesFor('dek lam'), ['Desk Lamp']);
    assert.deepEqual(namesFor('dsek lmap'), ['Desk Lamp']);
    assert.deepEqual(namesFor('keybaord'), ['Wireless Keyboard']);
    assert.deepEqual(namesFor('cerami mgu'), ['Ceramic Mug']);
    assert.deepEqual(namesFor('notbook'), ['A5 Notebook']);
    assert.deepEqual(namesFor('botle'), ['Water Bottle']);
    assert.deepEqual(namesFor('hedphones'), [
      'Noise-Cancelling Headphones',
      'Studio Headphones',
    ]);
  });

  for (const [keyword, expected] of [
    ['bedside', 'Desk Lamp'],
    ['latte', 'Ceramic Mug'],
    ['laptop', 'Wireless Keyboard'],
    ['diary', 'A5 Notebook'],
    ['gym', 'Water Bottle'],
    ['recording', 'Studio Headphones'],
    ['running', 'Wireless Earbuds'],
  ] as const) {
    it(`matches the extra keyword "${keyword}" to ${expected}`, () => {
      assert.deepEqual(namesFor(keyword), [expected]);
    });
  }

  it('does not correct very short or very different words', () => {
    assert.deepEqual(namesFor('qz'), []);
    assert.deepEqual(namesFor('desk xyzzy'), []);
  });
});

describe('findProducts typo handling', () => {
  for (const [description, term] of [
    ['a missing letter', 'flor'],
    ['an extra letter', 'floorr'],
    ['a wrong letter', 'flour'],
    ['two swapped letters', 'folor'],
    ['different letter case', 'FOLOR'],
  ] as const) {
    it(`corrects ${description}`, () => {
      assert.deepEqual(catalogueNamesFor(term), ['Floor Lamp']);
    });
  }

  it('does not correct words shorter than 3 letters', () => {
    assert.deepEqual(catalogueNamesFor('fn'), []);
    assert.deepEqual(catalogueNamesFor('dk'), []);
  });

  it('allows 1 typo in 3 to 5 letter words, but not 2', () => {
    assert.deepEqual(catalogueNamesFor('flxor'), ['Floor Lamp']);
    assert.deepEqual(catalogueNamesFor('flxxr'), []);
  });

  it('allows 2 typos in words of 6 or more letters, but not 3', () => {
    assert.deepEqual(catalogueNamesFor('kyebaord'), ['Wireless Keyboard']);
    assert.deepEqual(catalogueNamesFor('kxybxaxd'), []);
  });

  it('corrects a typo in a partly typed word', () => {
    assert.deepEqual(catalogueNamesFor('kayb'), ['Wireless Keyboard']);
  });

  it('prefers a whole word over an equally close start of a word', () => {
    // "lmap" is one change from "lamp" and from "lap" at the start of "laptop".
    assert.deepEqual(catalogueNamesFor('lmap'), ['Desk Lamp', 'Floor Lamp']);
  });

  it('keeps only the products with the closest word', () => {
    // "plantr" is 1 change from "planter" and 2 from "plaster", and "plastre" the reverse.
    assert.deepEqual(catalogueNamesFor('plantr'), ['Planter']);
    assert.deepEqual(catalogueNamesFor('plastre'), ['Plaster']);
  });

  it('combines exact and misspelled words', () => {
    assert.deepEqual(catalogueNamesFor('desk lmap'), ['Desk Lamp']);
    assert.deepEqual(catalogueNamesFor('lmap flor'), ['Floor Lamp']);
  });

  it('only corrects a word against products that matched the earlier words', () => {
    // "plastr" is closest to "plaster", but only "Planter" matches "garden".
    assert.deepEqual(catalogueNamesFor('garden plastr'), ['Planter']);
  });

  it('matches words inside hyphenated names', () => {
    assert.deepEqual(catalogueNamesFor('canceling'), [
      'Noise-Cancelling Headphones',
    ]);
  });

  it('uses an exact partial match instead of correcting it', () => {
    assert.deepEqual(findProducts(CATALOGUE, 'lam'), {
      products: [CATALOGUE[0], CATALOGUE[1]],
      isClosestMatch: false,
    });
  });

  it('returns nothing for an empty catalogue', () => {
    assert.deepEqual(findProducts([], 'lamp'), {
      products: [],
      isClosestMatch: false,
    });
  });
});

describe('findProducts isClosestMatch', () => {
  it('is true when a misspelled word was corrected', () => {
    assert.equal(findProducts(CATALOGUE, 'folor').isClosestMatch, true);
    assert.equal(findProducts(SAMPLE_PRODUCTS, 'dek lam').isClosestMatch, true);
  });

  it('is false when every word matched exactly', () => {
    assert.equal(findProducts(CATALOGUE, 'floor').isClosestMatch, false);
    assert.equal(
      findProducts(SAMPLE_PRODUCTS, 'desk lamp').isClosestMatch,
      false,
    );
  });

  it('is false when nothing was found', () => {
    assert.equal(findProducts(CATALOGUE, 'zzzz').isClosestMatch, false);
    assert.equal(findProducts(CATALOGUE, '').isClosestMatch, false);
  });
});

describe('normaliseSearchTerm', () => {
  it('trims and limits the term, and ignores non-strings', () => {
    assert.equal(normaliseSearchTerm('  lamp '), 'lamp');
    assert.equal(normaliseSearchTerm('a'.repeat(500)).length, 100);
    assert.equal(normaliseSearchTerm(['a', 'b']), '');
    assert.equal(normaliseSearchTerm(undefined), '');
  });
});
