import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Basket,
  BasketLine,
  MAX_QUANTITY,
  maxQuantityMessage,
} from '../src/models/basket';

test('calculates a line total in whole pence', () => {
  const line = new BasketLine('sample-lamp', 'Desk Lamp', 2499, 3);

  assert.equal(line.lineTotalPence, 7497);
});

test('calculates item count and total across lines', () => {
  const basket = new Basket('basket-1', [
    new BasketLine('sample-lamp', 'Desk Lamp', 2499, 2),
    new BasketLine('sample-mug', 'Ceramic Mug', 550, 3),
  ]);

  assert.equal(basket.itemCount, 5);
  assert.equal(basket.totalPence, 6648);
});

test('an empty basket has zero items and a zero total', () => {
  const basket = new Basket('basket-1', []);

  assert.equal(basket.itemCount, 0);
  assert.equal(basket.totalPence, 0);
});

test('accepts quantities of 1 and MAX_QUANTITY', () => {
  assert.equal(new BasketLine('p', 'Product', 100, 1).quantity, 1);
  assert.equal(
    new BasketLine('p', 'Product', 100, MAX_QUANTITY).quantity,
    MAX_QUANTITY,
  );
});

test('rejects invalid basket lines', () => {
  const invalidLines: [string, string, number, number][] = [
    ['', 'Product', 100, 1],
    ['p', ' ', 100, 1],
    ['p', 'Product', -1, 1],
    ['p', 'Product', 1.5, 1],
    ['p', 'Product', 100, 0],
    ['p', 'Product', 100, MAX_QUANTITY + 1],
    ['p', 'Product', 100, 2.5],
  ];
  for (const args of invalidLines) {
    assert.throws(() => new BasketLine(...args));
  }
});

test('rejects a basket without an id', () => {
  assert.throws(() => new Basket(' ', []));
});

test('builds the same maximum quantity message as the frontend', () => {
  assert.equal(
    maxQuantityMessage('Desk Lamp'),
    'You already have the maximum of 99 × Desk Lamp in your basket',
  );
});
