/**
 * The order form's own size reading (resources/js/orderPaste.ts), used when the server can't be reached.
 * Run: npx esbuild tests/js/orderPaste.test.ts --bundle --platform=node --outfile=<temp>/t.cjs
 *        --banner:js="globalThis.document={querySelector:()=>null};" && node --test <temp>/t.cjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSizesHere } from '../../resources/js/orderPaste';
import { ALL_SIZES } from '../../resources/js/orderSizes';

const read = (text: string) => readSizesHere(text, ALL_SIZES).items.map(i => ({ garment: i.garment, sizes: i.sizes }));

test('order 537: "SIZE x QTY" with commas gives all 50', () => {
  const [item] = read('i need XS x 3 , S x 5 , M x 5 , L x 5 , XL x 8 , 2XL x 8 , 3XL x 6 , 4xl x 5 , 5XL x 5');
  assert.deepEqual(item.sizes, { XS: 3, S: 5, M: 5, L: 5, XL: 8, '2XL': 8, '3XL': 6, '4XL': 5, '5XL': 5 });
  assert.equal(Object.values(item.sizes).reduce((a, b) => a + b, 0), 50);
});

test('any wording', () => {
  for (const text of ['XS x 3, S x 5, M x 2', '3 x XS, 5 x S, 2 x M', 'XS-3, S-5, M-2', 'XS: 3, S: 5, M: 2', '3 XS, 5 S, 2 M', 'XS x 3\nS x 5\nM x 2', '3xXS 5xS 2xM']) {
    assert.deepEqual(read(text)[0]?.sizes, { XS: 3, S: 5, M: 2 }, text);
  }
});

test('garments with their sizes', () => {
  assert.deepEqual(read('12 jerseys: 2 S, 4 M, 6 L'), [{ garment: 'jersey', sizes: { S: 2, M: 4, L: 6 } }]);
  assert.deepEqual(read('18 jerseys M; 12 shorts L'), [{ garment: 'jersey', sizes: { M: 18 } }, { garment: 'shorts', sizes: { L: 12 } }]);
});

test('a garment heading, then its sizes line by line', () => {
  assert.deepEqual(read('Polo\n3 x 4XL\n2 x 2XL'), [{ garment: 'polo', sizes: { '4XL': 3, '2XL': 2 } }]);
});

test('LINKTEST r1: spaced 3 XL, a size before a colon, players, nothing dropped quietly', () => {
  assert.deepEqual(read('jerseys: 2 XL x 4, 3 XL x 2, 4 XL x 1')[0].sizes, { '2XL': 4, '3XL': 2, '4XL': 1 });
  assert.deepEqual(read('XL X 8 , 2XL X 8 , 3 XL X 5 , 4XL X 5')[0].sizes, { XL: 8, '2XL': 8, '3XL': 5, '4XL': 5 });
  assert.deepEqual(read('3 XL, 5 L')[0].sizes, { XL: 3, L: 5 });
  assert.deepEqual(read('Polo XS: 2, S: 4, 2XL: 1'), [{ garment: 'polo', sizes: { XS: 2, S: 4, '2XL': 1 } }]);
  // A name, the shirt number and a size: one each (never 7 + 10 + 23 = 40).
  assert.deepEqual(read('John Smith 7 M, Jane Doe 10 L, Ari Tane 23 XL')[0].sizes, { M: 1, L: 1, XL: 1 });
  assert.deepEqual(read('i need 3 M')[0].sizes, { M: 3 });
  // Something left over: shown to check.
  assert.deepEqual(readSizesHere('XS x 3, S x 5, 7', ALL_SIZES).unknown, ['Part of your text was not read: please check the sizes.']);
  assert.deepEqual(readSizesHere('XS x 3, S x 5', ALL_SIZES).unknown, []);
});

test('womens and kids sizes with ":" or "="', () => {
  assert.deepEqual(read('W12: 3, 10Y = 2')[0].sizes, { W12: 3, '10Y': 2 });
  assert.deepEqual(read('3 x W12, 2 x Y10')[0].sizes, { W12: 3, '10Y': 2 });
  // Not placed for sure: shown to check, never dropped quietly.
  assert.equal(readSizesHere('Womens 12: 3', ALL_SIZES).unknown?.length, 1);
});
