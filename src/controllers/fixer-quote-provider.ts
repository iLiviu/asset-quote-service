import axios from 'axios';
import NodeCache from 'node-cache';

import { CONFIG } from '../config';
import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, QuoteProvider } from './quote-provider';

interface FixerAPIResponse {
  base: string;
  date: string;
  rates: Dictionary<number>;
  success: boolean;
  timestamp: number;
}

const FOREX_CACHE_KEY = '_forex_';

/**
 * Provide forex quotes from fixer.io
 */
export class FixerQuoteProvider implements QuoteProvider {
  private cache: NodeCache;

  constructor() {
    if (!CONFIG.FIXER_API_KEY) {
      throw new Error('Fixer API key not set!');
    }

    // we store the quotes for in cache for 90 minutes to avoid hitting api limit
    this.cache = new NodeCache({ stdTTL: 90 });
  }

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.STOCK);
  }

  getBondQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.BOND);
  }

  getCommodityQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return [''];
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  async getForexQuotes(symbols: string[]): Promise<Asset[]> {
    let obj: FixerAPIResponse;
    obj = this.cache.get(FOREX_CACHE_KEY);
    if (!obj) {
      const response = await axios.get(`http://data.fixer.io/api/latest?access_key=${CONFIG.FIXER_API_KEY}`);
      obj = response.data;
      if (obj && obj.success) {
        this.cache.set(FOREX_CACHE_KEY, obj);
      }
    }

    const quotes: Asset[] = [];
    if (obj && obj.success) {
      for (const symbol of symbols) {
        // check if symbol is a valid forex pair
        if (symbol.match(/[A-Z]{6,6}/)) {
          const fromCurrency = symbol.substr(0, 3);
          const toCurrency = symbol.substr(3, 3);
          if (obj.rates[fromCurrency] && obj.rates[toCurrency]) {
            quotes.push({
              price: obj.rates[toCurrency] / obj.rates[fromCurrency],
              symbol,
            });
          } else {
            quotes.push({
              price: null,
              symbol,
            });
          }
        }
      }
    }

    return quotes;
  }

  getId(): string {
    return 'Fixer';
  }
}

// register as quote provider
export const fixerQuoteProvider = new FixerQuoteProvider();
