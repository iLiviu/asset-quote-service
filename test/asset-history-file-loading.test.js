const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const app = require('../dist/app').default;
const {
  _clearCache,
  _getCache,
  _setYahooFinance,
  _resetYahooFinance,
  loadHistoryFromFiles,
} = require('../dist/controllers/asset-history-provider');

test('File Loading & Cache Integration for /history endpoint', async (t) => {
  let server;
  let baseUrl;
  let tempDir;
  const calls = [];

  const mockYahoo = {
    chart: async (symbol, opts) => {
      calls.push({ symbol, opts });
      return {
        meta: { currency: 'USD', symbol },
        quotes: [
          {
            date: new Date('2024-01-10T13:30:00.000Z'),
            open: 200,
            close: 205,
            high: 210,
            low: 195,
            adjclose: 205,
            volume: 500000,
          },
        ],
      };
    },
  };

  t.before(async () => {
    // Start temporary HTTP server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    _clearCache();
    _resetYahooFinance();
    await new Promise((resolve) => server.close(resolve));
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  t.beforeEach(() => {
    _clearCache();
    calls.length = 0;
    _setYahooFinance(mockYahoo);

    // Create a fresh temp directory for test fixtures
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-history-test-'));
  });

  t.afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('loadHistoryFromFiles populates historyCache from JSON files matching AssetHistory format', () => {
    const aaplData = {
      symbol: 'AAPL',
      currency: 'USD',
      history: [
        { date: '2024-01-02', price: 185.64 },
        { date: '2024-01-03', price: 184.25 },
        { date: '2024-01-04', price: 181.91 },
      ],
    };

    const msftData = {
      symbol: 'MSFT',
      currency: 'USD',
      history: [
        { date: '2024-01-02', price: 370.87 },
        { date: '2024-01-03', price: 370.60 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, 'AAPL.json'), JSON.stringify(aaplData, null, 2));
    fs.writeFileSync(path.join(tempDir, 'MSFT.json'), JSON.stringify(msftData, null, 2));

    const loaded = loadHistoryFromFiles(tempDir);
    assert.strictEqual(loaded, 2);

    const cache = _getCache();
    assert.strictEqual(cache.has('AAPL'), true);
    assert.strictEqual(cache.has('MSFT'), true);

    const aaplCached = cache.get('AAPL');
    assert.strictEqual(aaplCached.currency, 'USD');
    assert.strictEqual(aaplCached.cachedStartDate, '2024-01-02');
    assert.strictEqual(aaplCached.cachedEndDate, '2024-01-04');
    assert.strictEqual(aaplCached.records.length, 3);
    assert.strictEqual(aaplCached.records[0].price, 185.64);
    assert.strictEqual(aaplCached.records[2].price, 181.91);

    const msftCached = cache.get('MSFT');
    assert.strictEqual(msftCached.cachedStartDate, '2024-01-02');
    assert.strictEqual(msftCached.cachedEndDate, '2024-01-03');
    assert.strictEqual(msftCached.records.length, 2);
  });

  await t.test('loadHistoryFromFiles sorts records chronologically and deduplicates by date', () => {
    const tslaData = {
      symbol: 'TSLA',
      currency: 'USD',
      history: [
        { date: '2024-01-04', price: 238.45 },
        { date: '2024-01-02', price: 248.42 },
        { date: '2024-01-03', price: 238.45 },
        { date: '2024-01-02', price: 249.00 }, // duplicate date, fresher price
      ],
    };

    fs.writeFileSync(path.join(tempDir, 'TSLA.json'), JSON.stringify(tslaData));
    loadHistoryFromFiles(tempDir);

    const cached = _getCache().get('TSLA');
    assert.ok(cached);
    assert.strictEqual(cached.records.length, 3);
    assert.strictEqual(cached.records[0].date, '2024-01-02');
    assert.strictEqual(cached.records[0].price, 249.00);
    assert.strictEqual(cached.records[1].date, '2024-01-03');
    assert.strictEqual(cached.records[2].date, '2024-01-04');
    assert.strictEqual(cached.cachedStartDate, '2024-01-02');
    assert.strictEqual(cached.cachedEndDate, '2024-01-04');
  });

  await t.test('POST /history serves historic quotes loaded from file cache without external network call', async () => {
    const btcData = {
      symbol: 'BTC-USD',
      currency: 'USD',
      history: [
        { date: '2024-01-02', price: 44970 },
        { date: '2024-01-03', price: 42848 },
        { date: '2024-01-04', price: 44179 },
        { date: '2024-01-05', price: 44167 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, 'BTC-USD.json'), JSON.stringify(btcData));
    loadHistoryFromFiles(tempDir);

    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['BTC-USD'],
        startDate: '2024-01-02',
        endDate: '2024-01-05',
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.length, 1);
    assert.strictEqual(body[0].symbol, 'BTC-USD');
    assert.strictEqual(body[0].currency, 'USD');
    assert.strictEqual(body[0].history.length, 4);
    assert.strictEqual(body[0].history[0].price, 44970);
    assert.strictEqual(body[0].history[3].price, 44167);

    // Must not call external Yahoo Finance
    assert.strictEqual(calls.length, 0, 'Should serve directly from file-loaded cache');
  });

  await t.test('POST /history correctly returns sub-interval of file-loaded historical quotes', async () => {
    const nvdaData = {
      symbol: 'NVDA',
      currency: 'USD',
      history: [
        { date: '2024-01-02', price: 48.17 },
        { date: '2024-01-03', price: 47.57 },
        { date: '2024-01-04', price: 47.99 },
        { date: '2024-01-05', price: 49.10 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, 'NVDA.json'), JSON.stringify(nvdaData));
    loadHistoryFromFiles(tempDir);

    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['NVDA'],
        startDate: '2024-01-03',
        endDate: '2024-01-04',
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body[0].history.length, 2);
    assert.strictEqual(body[0].history[0].date, '2024-01-03');
    assert.strictEqual(body[0].history[1].date, '2024-01-04');
    assert.strictEqual(calls.length, 0, 'Sub-interval served from cache with 0 network calls');
  });

  await t.test('loadHistoryFromFiles ignores hidden files, directories, and handles malformed files gracefully', () => {
    // Hidden file
    fs.writeFileSync(path.join(tempDir, '.gitkeep'), '');
    fs.writeFileSync(path.join(tempDir, '.DS_Store'), 'junk');

    // Subdirectory
    fs.mkdirSync(path.join(tempDir, 'nested'));

    // Malformed JSON
    fs.writeFileSync(path.join(tempDir, 'corrupted.json'), '{ not valid json');

    // Valid file
    fs.writeFileSync(
      path.join(tempDir, 'VALID.json'),
      JSON.stringify({ symbol: 'VALID', history: [{ date: '2024-01-02', price: 10 }] }),
    );

    const loaded = loadHistoryFromFiles(tempDir);
    assert.strictEqual(loaded, 1);
    assert.strictEqual(_getCache().has('VALID'), true);
  });

  await t.test('loadHistoryFromFiles returns 0 for non-existent directory without throwing', () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');
    assert.doesNotThrow(() => {
      const loaded = loadHistoryFromFiles(nonExistent);
      assert.strictEqual(loaded, 0);
    });
  });

  await t.test('POST /history handles mixed requests (file-cached and non-cached symbols)', async () => {
    const cachedData = {
      symbol: 'CACHED',
      currency: 'USD',
      history: [
        { date: '2024-01-02', price: 100 },
        { date: '2024-01-03', price: 105 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, 'CACHED.json'), JSON.stringify(cachedData));
    loadHistoryFromFiles(tempDir);

    const res = await fetch(`${baseUrl}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: ['CACHED', 'REMOTE'],
        startDate: '2024-01-02',
        endDate: '2024-01-03',
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.length, 2);

    // CACHED came from file
    assert.strictEqual(body[0].symbol, 'CACHED');
    assert.strictEqual(body[0].history.length, 2);
    assert.strictEqual(body[0].history[0].price, 100);

    // REMOTE came from network
    assert.strictEqual(body[1].symbol, 'REMOTE');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].symbol, 'REMOTE');
  });

  await t.test('loadHistoryFromFiles uses default data/history directory when called without arguments', () => {
    const defaultDataDir = path.resolve(process.cwd(), 'data/history');
    const testFile = path.join(defaultDataDir, 'DEFAULT_TEST.json');

    try {
      fs.writeFileSync(
        testFile,
        JSON.stringify({
          symbol: 'DEFAULT_TEST',
          currency: 'EUR',
          history: [{ date: '2024-01-02', price: 50 }],
        }),
      );

      const loaded = loadHistoryFromFiles();
      assert.ok(loaded >= 1);
      assert.strictEqual(_getCache().has('DEFAULT_TEST'), true);
      assert.strictEqual(_getCache().get('DEFAULT_TEST').currency, 'EUR');
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });
});
