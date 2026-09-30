import YahooFinance from 'yahoo-finance2';
import { ChartResultArray } from 'yahoo-finance2/esm/src/modules/chart';

import logger from '../logger';
import { parseSymbol } from './quote-provider';
import { YAHOO_EXCHANGE_CODES } from '../shared/yfinance.consts';

let yahooFinanceInstance = new YahooFinance();

export function _setYahooFinance(instance: any) {
  yahooFinanceInstance = instance;
}

export function _resetYahooFinance() {
  yahooFinanceInstance = new YahooFinance();
}

export interface HistoricalPriceRecord {
  date: Date;
  price: number | null;
}

export interface StockHistory {
  symbol: string;
  currency?: string;
  history: HistoricalPriceRecord[];
  error?: string;
}

/** Cached data for a single symbol */
interface CachedHistory {
  currency?: string;
  records: HistoricalPriceRecord[]; // sorted ascending by date
  cachedStartDate: string;          // earliest requested start date (YYYY-MM-DD)
  cachedEndDate?: string;           // latest requested end date (YYYY-MM-DD); undefined if fetched up to today
  lastFetched: Date;
}

/** In-memory cache: symbol → CachedHistory */
const historyCache: Map<string, CachedHistory> = new Map();

export function _clearCache() {
  historyCache.clear();
}

export function _getCache(): Map<string, CachedHistory> {
  return historyCache;
}

/**
 * Fetch daily historical prices from Yahoo Finance for a given date range.
 * @param symbol   Ticker symbol
 * @param period1  Start date (ISO string, e.g. "2024-01-01")
 * @param period2  End date (ISO string). If omitted, defaults to today.
 */
async function fetchFromYahoo(
  symbol: string,
  period1: string,
  period2?: string,
): Promise<{ currency?: string; records: HistoricalPriceRecord[] }> {
  const opts: { period1: string; period2?: string; interval: '1d'; return: 'array' } = {
    period1,
    interval: '1d',
    return: 'array',
  };
  if (period2) {
    opts.period2 = period2;
  }

  const symbolParts = parseSymbol(symbol);

  // Yahoo Finance uses different exchange codes than the MIC codes used in our system.
  const yMarketCode = YAHOO_EXCHANGE_CODES[symbolParts.marketCode];
  let formattedSymbol:string;
  if (yMarketCode) {
    formattedSymbol = symbolParts.shortSymbol + '.' + yMarketCode;
  } else {
    formattedSymbol =symbolParts.shortSymbol;
  }

  const result = await yahooFinanceInstance.chart(formattedSymbol, opts) as unknown as ChartResultArray;

  const records: HistoricalPriceRecord[] = result.quotes.map((q) => ({
    date: q.date,
    price: q.close ? q.close : q.open,
  }));

  return {
    currency: result.meta && result.meta.currency,
    records,
  };
}

/** Format a Date to YYYY-MM-DD string */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * If a date string (YYYY-MM-DD) falls on a weekend (Saturday or Sunday),
 * rolls it back to the preceding Friday.
 *
 * @param dateStr ISO date string (YYYY-MM-DD)
 * @returns Preceding Friday if dateStr is Saturday or Sunday, otherwise original dateStr
 */
export function adjustWeekendToFriday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 is Sunday, 6 is Saturday
  if (day === 6) { // Saturday -> Friday (-1 day)
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  }
  if (day === 0) { // Sunday -> Friday (-2 days)
    d.setDate(d.getDate() - 2);
    return toDateStr(d);
  }
  return dateStr.split('T')[0];
}

/**
 * Merge two sorted record arrays, deduplicating by date.
 * When both arrays have a record for the same date, `b` takes priority
 * (assumed to be the fresher fetch).
 */
export function mergeRecords(
  a: HistoricalPriceRecord[],
  b: HistoricalPriceRecord[],
): HistoricalPriceRecord[] {
  const map = new Map<string, HistoricalPriceRecord>();
  for (const r of a) {
    map.set(toDateStr(new Date(r.date)), r);
  }
  for (const r of b) {
    map.set(toDateStr(new Date(r.date)), r); // b overwrites a on duplicate dates
  }
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime(),
  );
}

/**
 * Fetch daily historical prices for a single symbol using yahoo-finance2,
 * with intelligent caching to minimise Yahoo Finance API calls.
 *
 * Cache strategy:
 *  1. No cache entry                         → full fetch for requested interval, store in cache.
 *  2. Both start & end covered               → served entirely from cache.
 *  3. Start covered, end missing             → fetch only the missing tail, merge with cache.
 *  4. End covered, start missing             → fetch only the missing head, merge with cache.
 *  5. Neither covered (missing both sides)   → full fetch for requested interval, replace cache.
 *
 * @param symbol    Ticker symbol (e.g. "AAPL")
 * @param startDate Start date string (ISO format, e.g. "2024-01-01")
 * @param endDate   Optional end date string (ISO format). Defaults to today.
 * @returns StockHistory with daily price records for the requested interval
 */
export async function getStockHistory(
  symbol: string,
  startDate: string,
  endDate?: string,
): Promise<StockHistory> {
  try {
    const now = new Date();
    const todayStr = toDateStr(now);
    const todayDay = now.getDay();
    const isWeekend = todayDay === 0 || todayDay === 6;

    // Stock market is closed on weekends.
    // If startDate is on weekend, roll back to preceding Friday.
    // If endDate is on weekend, roll back to preceding Friday.
    // If endDate is omitted and today is a weekend, roll back to preceding Friday.
    const startDateStr = adjustWeekendToFriday(toDateStr(new Date(startDate)));

    let endDateStr: string | undefined;
    if (endDate) {
      endDateStr = adjustWeekendToFriday(toDateStr(new Date(endDate)));
    } else if (isWeekend) {
      endDateStr = adjustWeekendToFriday(todayStr);
    }

    const cached = historyCache.get(symbol);

    let allRecords: HistoricalPriceRecord[];
    let currency: string | undefined;
    let newCachedStartDate: string;
    let newCachedEndDate: string | undefined;

    if (!cached || cached.records.length === 0) {
      // ── 1. No cache: full fetch ──────────────────────────────────────────
      logger.debug(`[history-cache] MISS for ${symbol}, full fetch from ${startDateStr}`);
      const fetched = await fetchFromYahoo(symbol, startDateStr, endDateStr);
      allRecords = fetched.records;
      currency = fetched.currency;
      newCachedStartDate = startDateStr;
      newCachedEndDate = endDateStr;
    } else {
      currency = cached.currency;

      // Start is covered if cache starts on or before requested start date,
      // AND requested start falls within the cached range (not after cachedEndDate)
      const cacheCoversStart =
        cached.cachedStartDate <= startDateStr &&
        (!cached.cachedEndDate || startDateStr <= cached.cachedEndDate);

      // End is covered if:
      // a) endDate is specified and cachedEndDate is at or after requested endDate (and requested end >= cachedStartDate)
      // b) endDate is specified and cache has no endDate (cached up to today) and requested endDate <= today
      // c) endDate is not specified (implicit today), and cache was fetched up to today AND lastFetched was today
      let cacheCoversEnd = false;
      if (endDateStr) {
        if (endDateStr >= cached.cachedStartDate) {
          if (cached.cachedEndDate) {
            cacheCoversEnd = cached.cachedEndDate >= endDateStr;
          } else {
            cacheCoversEnd = endDateStr <= todayStr;
          }
        }
      } else {
        const fetchedToday = cached.lastFetched && toDateStr(cached.lastFetched) >= todayStr;
        cacheCoversEnd = !cached.cachedEndDate && fetchedToday;
      }

      if (cacheCoversStart && cacheCoversEnd) {
        // ── 2. Full cache hit: no fetch needed ──────────────────────────────
        logger.debug(`[history-cache] HIT for ${symbol}, serving from cache`);
        allRecords = cached.records;
        newCachedStartDate = cached.cachedStartDate;
        newCachedEndDate = cached.cachedEndDate;
      } else if (cacheCoversStart) {
        // ── 3. Start covered, end missing: fetch only missing tail ───────────
        const fetchFrom = cached.cachedEndDate || cached.cachedStartDate;
        logger.debug(`[history-cache] PARTIAL (tail) for ${symbol}, fetching ${fetchFrom} → ${endDateStr || 'today'}`);
        const fetched = await fetchFromYahoo(symbol, fetchFrom, endDateStr);
        allRecords = mergeRecords(cached.records, fetched.records);
        if (fetched.currency) {
          currency = fetched.currency;
        }
        newCachedStartDate = cached.cachedStartDate;
        newCachedEndDate = endDateStr;
      } else if (cacheCoversEnd) {
        // ── 4. End covered, start missing: fetch only missing head ───────────
        const fetchUntil = cached.cachedStartDate;
        logger.debug(`[history-cache] PARTIAL (head) for ${symbol}, fetching ${startDateStr} → ${fetchUntil}`);
        const fetched = await fetchFromYahoo(symbol, startDateStr, fetchUntil);
        allRecords = mergeRecords(fetched.records, cached.records);
        if (fetched.currency) {
          currency = fetched.currency;
        }
        newCachedStartDate = startDateStr;
        newCachedEndDate = cached.cachedEndDate;
      } else {
        // ── 5. Neither covered: missing both sides, full re-fetch & replace ──
        logger.debug(`[history-cache] MISS for ${symbol}, missing both sides, full re-fetch & replace cache`);
        const fetched = await fetchFromYahoo(symbol, startDateStr, endDateStr);
        allRecords = fetched.records;
        currency = fetched.currency;
        newCachedStartDate = startDateStr;
        newCachedEndDate = endDateStr;
      }
    }

    // Persist to cache
    historyCache.set(symbol, {
      currency,
      records: allRecords,
      cachedStartDate: newCachedStartDate,
      cachedEndDate: newCachedEndDate,
      lastFetched: new Date(),
    });

    // Filter output to requested interval
    const trimmed = allRecords.filter((r) => {
      const dStr = toDateStr(new Date(r.date));
      if (dStr < startDateStr) {
        return false;
      }
      if (endDateStr && dStr > endDateStr) {
        return false;
      }
      return true;
    });

    return {
      symbol,
      currency,
      history: trimmed,
    };
  } catch (err) {
    logger.error(`Could not get history for ${symbol}: ${err}`);
    return {
      symbol,
      history: [],
      error: `Failed to fetch history for symbol: ${symbol}`,
    };
  }
}
