import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Product } from '../src/models/product';

function productWithPrice(unitPricePence: number): Product {
  return new Product({
    id: 'sample-lamp',
    name: 'Desk Lamp',
    description: '',
    imageUrl: '',
    unitPricePence,
    keywords: [],
    isInStock: true,
  });
}

test('formats the price in pounds with 2 decimal places', () => {
  assert.equal(productWithPrice(2499).price, '24.99');
  assert.equal(productWithPrice(550).price, '5.50');
  assert.equal(productWithPrice(4900).price, '49.00');
  assert.equal(productWithPrice(5).price, '0.05');
  assert.equal(productWithPrice(0).price, '0.00');
});

test('rejects a blank id or name', () => {
  const details = {
    id: 'sample-lamp',
    name: 'Desk Lamp',
    description: '',
    imageUrl: '',
    unitPricePence: 100,
    keywords: [],
    isInStock: true,
  };

  assert.throws(() => new Product({ ...details, id: ' ' }), /id/);
  assert.throws(() => new Product({ ...details, name: '' }), /name/);
});

test('rejects a negative or fractional price', () => {
  assert.throws(() => productWithPrice(-1), /whole number of pence/);
  assert.throws(() => productWithPrice(1.5), /whole number of pence/);
});
