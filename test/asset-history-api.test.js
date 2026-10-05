const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const app = require('../dist/app').default;
const {
  _clearCache,
  _setYahooFinance,
  _resetYahooFinance,
} = require('../dist/controllers/asset-history-provider');

test('HTTP API: POST /history endpoint tests', async (t) => {
  let server;
  let baseUrl;

  // Start temporary server for HTTP tests
  t.before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    _clearCache();
    _resetYahooFinance();
    await new Promise((resolve) => server.close(resolve));
  });

  // Mock Yahoo Finance to keep tests fast, deterministic, and offline
  const mockYahoo = {
    chart: async (symbol, opts) => {
      if (symbol === 'FAIL_SYM') {
        throw new Error('Network error or symbol not found');
      }
      return {
        meta: { currency: 'USD', symbol },
        quotes: [
          {
            date: new Date('2025-06-02T13:30:00.000Z'),
            open: 150,
            close: 152,
            high: 153,
            low: 149,
            adjclose: 152,
            volume: 1000000,
          },
          {
            date: new Date('2025-06-03T13:30:00.000Z'),
            open: 152,
            close: 155,
            high: 156,
            low: 151,
            adjclose: 155,
            volume: 1200000,
          },
        ],
      };
    },
  };

  t.beforeEach(() => {
    _clearCache();
    _setYahooFinance(mockYahoo);
  });

  await t.test('POST /history returns 200 with historical quotes for valid request', async () => {
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['AAPL', 'MSFT'],
        startDate: '2025-06-02',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Array.isArray(data), true);
    assert.strictEqual(data.length, 2);

    assert.strictEqual(data[0].symbol, 'AAPL');
    assert.strictEqual(data[0].currency, 'USD');
    assert.strictEqual(data[0].history.length, 2);
    assert.strictEqual(data[0].history[0].price, 152);

    assert.strictEqual(data[1].symbol, 'MSFT');
    assert.strictEqual(data[1].currency, 'USD');
  });

  await t.test('POST /history supports optional endDate parameter', async () => {
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['AAPL'],
        startDate: '2025-06-01',
        endDate: '2025-06-02',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 1);
    // Should be filtered up to 2025-06-02
    assert.strictEqual(data[0].history.length, 1);
  });

  await t.test('POST /history automatically adjusts weekend endDate to preceding Friday', async () => {
    // 2025-06-07 is Saturday -> adjusted to Friday 2025-06-06
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['AAPL'],
        startDate: '2025-06-01',
        endDate: '2025-06-07',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].symbol, 'AAPL');
    assert.ok(data[0].history.length > 0);
  });

  await t.test('POST /history automatically adjusts weekend startDate to preceding Friday', async () => {
    // 2025-06-07 is Saturday -> adjusted to Friday 2025-06-06
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['AAPL'],
        startDate: '2025-06-07',
        endDate: '2025-06-10',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].symbol, 'AAPL');
  });

  await t.test('POST /history returns 400 when startDate is missing', async () => {
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['AAPL'],
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, 400);
    assert.strictEqual(body.message, 'Invalid request');
  });

  await t.test('POST /history returns 400 when symbols parameter is missing', async () => {
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: '2025-06-01',
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, 400);
    assert.strictEqual(body.message, 'Invalid request');
  });

  await t.test('POST /history returns 400 when symbols array is empty', async () => {
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: [],
        startDate: '2025-06-01',
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, 400);
    assert.strictEqual(body.message, 'Invalid request');
  });

  await t.test('POST /history handles individual symbol errors gracefully without failing request', async () => {
    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['AAPL', 'FAIL_SYM'],
        startDate: '2025-06-02',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 2);

    // AAPL succeeded
    assert.strictEqual(data[0].symbol, 'AAPL');
    assert.strictEqual(data[0].history.length, 2);

    // FAIL_SYM failed gracefully
    assert.strictEqual(data[1].symbol, 'FAIL_SYM');
    assert.strictEqual(data[1].history.length, 0);
    assert.ok(data[1].error);
  });
});
