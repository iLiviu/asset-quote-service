const test = require('node:test');
const assert = require('node:assert');

const {
  getAssetHistory,
  toDateStr,
  adjustWeekendToFriday,
  mergeRecords,
  _clearCache,
  _getCache,
  _setYahooFinance,
  _resetYahooFinance,
} = require('../dist/controllers/asset-history-provider');

// Helper to construct mock historical quotes
function makeQuote(dateStr, price) {
  return {
    date: new Date(`${dateStr}T13:30:00.000Z`),
    open: price,
    close: price,
    high: price + 1,
    low: price - 1,
    adjclose: price,
    volume: 1000000,
  };
}

// Generate an array of daily mock quotes between two dates (excluding weekends)
function generateMockQuotes(startDateStr, endDateStr, basePrice = 150) {
  const quotes = [];
  let current = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T00:00:00.000Z`);

  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) { // skip Sat (6) and Sun (0)
      const dStr = toDateStr(current);
      quotes.push(makeQuote(dStr, basePrice + quotes.length));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return quotes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNIT TESTS: Date Formatting & Record Merging
// ─────────────────────────────────────────────────────────────────────────────
test('Unit: Date utilities and record merging', async (t) => {
  await t.test('toDateStr correctly formats date to YYYY-MM-DD', () => {
    const d1 = new Date(2025, 0, 1, 0, 0, 0); // 2025-01-01 00:00 
    assert.strictEqual(toDateStr(d1), '2025-01-01');

    const d2 = new Date(2025, 11, 31, 23, 59, 59); // 2025-12-31 23:59 
    assert.strictEqual(toDateStr(d2), '2025-12-31');

    const d3 = new Date(2025, 8, 5, 14, 30, 0); // 2025-09-05 14:30 
    assert.strictEqual(toDateStr(d3), '2025-09-05');
  });

  await t.test('adjustWeekendToFriday rolls back Saturday and Sunday to preceding Friday, leaving weekdays untouched', () => {
    // 2025-06-06 is Friday
    assert.strictEqual(adjustWeekendToFriday('2025-06-06'), '2025-06-06', 'Friday must remain Friday');
    // 2025-06-07 is Saturday -> Friday 2025-06-06
    assert.strictEqual(adjustWeekendToFriday('2025-06-07'), '2025-06-06', 'Saturday must roll back to Friday');
    // 2025-06-08 is Sunday -> Friday 2025-06-06
    assert.strictEqual(adjustWeekendToFriday('2025-06-08'), '2025-06-06', 'Sunday must roll back to Friday');
    // 2025-06-09 is Monday
    assert.strictEqual(adjustWeekendToFriday('2025-06-09'), '2025-06-09', 'Monday must remain Monday');
    // 2025-06-11 is Wednesday
    assert.strictEqual(adjustWeekendToFriday('2025-06-11'), '2025-06-11', 'Wednesday must remain Wednesday');
  });

  await t.test('mergeRecords merges two non-overlapping arrays in sorted date order', () => {
    const a = [
      { date: '2025-01-01', price: 100 },
      { date: '2025-01-02', price: 101 },
    ];
    const b = [
      { date: '2025-01-03', price: 102 },
      { date: '2025-01-04', price: 103 },
    ];

    const merged = mergeRecords(a, b);
    assert.strictEqual(merged.length, 4);
    assert.strictEqual(toDateStr(new Date(merged[0].date)), '2025-01-01');
    assert.strictEqual(toDateStr(new Date(merged[3].date)), '2025-01-04');
  });

  await t.test('mergeRecords deduplicates overlapping dates and gives priority to fresher records (array b)', () => {
    const a = [
      { date: '2025-01-01', price: 100 },
      { date: '2025-01-02', price: 101 },
    ];
    const b = [
      { date: '2025-01-02', price: 105 }, // updated price on boundary
      { date: '2025-01-03', price: 106 },
    ];

    const merged = mergeRecords(a, b);
    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged[1].price, 105, 'Fresher record b should overwrite older record a');
  });

  await t.test('mergeRecords handles empty arrays', () => {
    const a = [{ date: '2025-01-01', price: 100 }];
    assert.strictEqual(mergeRecords([], a).length, 1);
    assert.strictEqual(mergeRecords(a, []).length, 1);
    assert.strictEqual(mergeRecords([], []).length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BOUNDARY TESTS: Caching Mechanism & Boundary Conditions
// ─────────────────────────────────────────────────────────────────────────────
test('Boundary: Caching mechanism paths with mocked Yahoo Finance', async (t) => {
  // Track all invocations of chart()
  const calls = [];

  const mockYahoo = {
    chart: async (symbol, opts) => {
      calls.push({ symbol, opts });
      if (symbol === 'ERROR_SYM') {
        throw new Error('Symbol not found or delisted');
      }

      const p1 = opts.period1.split('T')[0];
      const p2 = opts.period2 ? opts.period2.split('T')[0] : '2025-12-31';
      const quotes = generateMockQuotes(p1, p2);
      return {
        meta: { currency: 'USD', symbol },
        quotes,
      };
    },
  };

  t.beforeEach(() => {
    _clearCache();
    calls.length = 0;
    _setYahooFinance(mockYahoo);
  });

  t.after(() => {
    _clearCache();
    _resetYahooFinance();
  });

  await t.test('Boundary 1: Cache Miss - Full fetch on first request', async () => {
    const res = await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');

    assert.strictEqual(calls.length, 1, 'Should call Yahoo Finance once');
    assert.strictEqual(calls[0].opts.period1, '2025-06-02');
    assert.strictEqual(calls[0].opts.period2, '2025-08-01');
    assert.ok(res.history.length > 0);
    assert.strictEqual(res.symbol, 'AAPL');
    assert.strictEqual(res.currency, 'USD');

    // Verify cache state
    const cached = _getCache().get('AAPL');
    assert.ok(cached);
    assert.strictEqual(cached.cachedStartDate, '2025-06-02');
    assert.strictEqual(cached.cachedEndDate, '2025-08-01');
  });

  await t.test('Boundary 2: Exact Match Cache Hit - Zero external requests', async () => {
    // Populate cache
    await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');
    calls.length = 0;

    // Exact repeat request
    const res = await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');

    assert.strictEqual(calls.length, 0, 'Should not call Yahoo Finance on exact cache hit');
    assert.ok(res.history.length > 0);
    assert.strictEqual(res.symbol, 'AAPL');
  });

  await t.test('Boundary 3: Sub-Interval Cache Hit - Returns filtered data without network call', async () => {
    // Populate with 2025-06-02 to 2025-08-01
    await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');
    calls.length = 0;

    // Request sub-interval: 2025-06-16 (Monday) to 2025-07-16 (Wednesday)
    const res = await getAssetHistory('AAPL', '2025-06-16', '2025-07-16');

    assert.strictEqual(calls.length, 0, 'Sub-interval must be served entirely from cache');
    const firstDate = toDateStr(new Date(res.history[0].date));
    const lastDate = toDateStr(new Date(res.history[res.history.length - 1].date));
    assert.ok(firstDate >= '2025-06-16', `First date ${firstDate} must be >= 2025-06-16`);
    assert.ok(lastDate <= '2025-07-16', `Last date ${lastDate} must be <= 2025-07-16`);
  });

  await t.test('Boundary 4: Missing Tail (Start Covered, End Missing) - Fetches only the tail', async () => {
    // Initial cache: 2025-06-02 to 2025-08-01
    await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');
    calls.length = 0;

    // Extended end: 2025-06-02 to 2025-09-01
    const res = await getAssetHistory('AAPL', '2025-06-02', '2025-09-01');

    assert.strictEqual(calls.length, 1, 'Should call Yahoo Finance once for the tail');
    assert.strictEqual(calls[0].opts.period1, '2025-08-01', 'Tail fetch starts at previous cachedEndDate');
    assert.strictEqual(calls[0].opts.period2, '2025-09-01', 'Tail fetch ends at requested endDate');

    // Verify cache updated
    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedStartDate, '2025-06-02');
    assert.strictEqual(cached.cachedEndDate, '2025-09-01');
    assert.ok(res.history.length > 0);
  });

  await t.test('Boundary 5: Missing Head (End Covered, Start Missing) - Fetches only the head', async () => {
    // Initial cache: 2025-06-02 to 2025-08-01
    await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');
    calls.length = 0;

    // Extended start: 2025-04-01 to 2025-08-01
    const res = await getAssetHistory('AAPL', '2025-04-01', '2025-08-01');

    assert.strictEqual(calls.length, 1, 'Should call Yahoo Finance once for the head');
    assert.strictEqual(calls[0].opts.period1, '2025-04-01', 'Head fetch starts at requested startDate');
    assert.strictEqual(calls[0].opts.period2, '2025-06-02', 'Head fetch ends at previous cachedStartDate');

    // Verify cache updated
    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedStartDate, '2025-04-01');
    assert.strictEqual(cached.cachedEndDate, '2025-08-01');
    assert.ok(res.history.length > 0);
  });

  await t.test('Boundary 6: Missing Both Sides - Full re-fetch and cache replacement', async () => {
    // Initial cache: 2025-06-02 to 2025-08-01
    await getAssetHistory('AAPL', '2025-06-02', '2025-08-01');
    calls.length = 0;

    // Both sides missing: 2025-01-01 to 2025-12-01
    const res = await getAssetHistory('AAPL', '2025-01-01', '2025-12-01');

    assert.strictEqual(calls.length, 1, 'Should perform a full fetch when both sides missing');
    assert.strictEqual(calls[0].opts.period1, '2025-01-01');
    assert.strictEqual(calls[0].opts.period2, '2025-12-01');

    // Verify cache replaced
    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedStartDate, '2025-01-01');
    assert.strictEqual(cached.cachedEndDate, '2025-12-01');
  });

  await t.test('Boundary 7: Disjoint Interval in Future - Replaces old cache', async () => {
    // Initial cache: 2024-01-01 to 2024-03-01
    await getAssetHistory('AAPL', '2024-01-01', '2024-03-01');
    calls.length = 0;

    // Disjoint interval: 2025-01-01 to 2025-03-05 (Wednesday)
    await getAssetHistory('AAPL', '2025-01-01', '2025-03-05');

    assert.strictEqual(calls.length, 1, 'Should perform full fetch for disjoint interval');
    assert.strictEqual(calls[0].opts.period1, '2025-01-01');
    assert.strictEqual(calls[0].opts.period2, '2025-03-05');

    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedStartDate, '2025-01-01');
    assert.strictEqual(cached.cachedEndDate, '2025-03-05');
  });

  await t.test('Boundary 8: Implicit End Date (Up to Today) - Caches and hits on same day', async () => {
    // Request without endDate
    const res1 = await getAssetHistory('AAPL', '2025-01-01');

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].opts.period1, '2025-01-01');
    assert.strictEqual(calls[0].opts.period2, undefined, 'Implicit end date must omit period2');

    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedEndDate, undefined, 'cachedEndDate should be undefined when fetched up to today');
    assert.ok(cached.lastFetched instanceof Date);

    // Repeat on same day without endDate
    calls.length = 0;
    const res2 = await getAssetHistory('AAPL', '2025-01-01');

    assert.strictEqual(calls.length, 0, 'Must hit cache for subsequent requests to today on same day');
    assert.strictEqual(res2.history.length, res1.history.length);
  });

  await t.test('Boundary 9: Weekend Start Date - Rolls back Saturday/Sunday to preceding Friday', async () => {
    // 2025-06-07 is Saturday -> rolls back to Friday 2025-06-06
    const res1 = await getAssetHistory('AAPL', '2025-06-07', '2025-06-20');

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].opts.period1, '2025-06-06', 'period1 passed to Yahoo must be rolled back to Friday');

    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedStartDate, '2025-06-06', 'cachedStartDate must be Friday 2025-06-06');

    // Repeat with Saturday start date -> 100% cache hit
    calls.length = 0;
    const res2 = await getAssetHistory('AAPL', '2025-06-07', '2025-06-20');
    assert.strictEqual(calls.length, 0, 'Should not re-fetch when start date was Saturday');
    assert.strictEqual(res2.history.length, res1.history.length);

    // Repeat with Sunday start date (2025-06-08 rolls back to 2025-06-06) -> 100% cache hit
    calls.length = 0;
    const res3 = await getAssetHistory('AAPL', '2025-06-08', '2025-06-20');
    assert.strictEqual(calls.length, 0, 'Should not re-fetch when start date was Sunday');
    assert.strictEqual(res3.history.length, res1.history.length);
  });

  await t.test('Boundary 10: Delisted / Error Symbol - Returns error without corrupting cache', async () => {
    const res = await getAssetHistory('ERROR_SYM', '2025-01-01', '2025-02-01');

    assert.strictEqual(res.symbol, 'ERROR_SYM');
    assert.strictEqual(res.history.length, 0);
    assert.ok(res.error.includes('Failed to fetch history for symbol: ERROR_SYM'));
    assert.strictEqual(_getCache().has('ERROR_SYM'), false, 'Failed symbol must not be cached');
  });

  await t.test('Boundary 11: Weekend End Date - Rolls back Saturday/Sunday to Friday and hits cache on weekend calls', async () => {
    // 2025-06-06 is Friday, 2025-06-07 is Saturday, 2025-06-08 is Sunday
    // User requests with endDate on Saturday: should roll back to Friday 2025-06-06
    const res1 = await getAssetHistory('AAPL', '2025-06-01', '2025-06-07');

    assert.strictEqual(calls.length, 1, 'Initial request calls Yahoo');
    assert.strictEqual(calls[0].opts.period2, '2025-06-06', 'period2 passed to Yahoo must be Friday');

    const cached = _getCache().get('AAPL');
    assert.strictEqual(cached.cachedEndDate, '2025-06-06', 'cachedEndDate must be Friday 2025-06-06');

    // Repeat on Saturday: must be a 100% cache hit
    calls.length = 0;
    const res2 = await getAssetHistory('AAPL', '2025-06-01', '2025-06-07');
    assert.strictEqual(calls.length, 0, 'Repeat call on Saturday must be a 100% cache hit');
    assert.strictEqual(res2.history.length, res1.history.length);

    // Call on Sunday with Sunday endDate: must ALSO be a 100% cache hit
    calls.length = 0;
    const res3 = await getAssetHistory('AAPL', '2025-06-01', '2025-06-08');
    assert.strictEqual(calls.length, 0, 'Call on Sunday with Sunday endDate must also be a 100% cache hit');
    assert.strictEqual(res3.history.length, res1.history.length);
  });
});
