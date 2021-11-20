import axios from 'axios';
import { CONFIG } from '../config';

import { Dictionary } from '../models/dictionary';
import {
  Asset, AssetType, AssetTypeNotSupportedError, getShortSymbols, mapStringKeyValues, parseSymbol, QuoteProvider,
} from './quote-provider';

interface IEXQuote {
  symbol: string;
  price: number;
  size: number;
  time: number;
}

interface IEXCryptoQuote {
  symbol: string;
  latestPrice: number;
}

/**
 * Provide cryptocurrency and stock quotes(north america) from IEX
 */
export class IEXQuoteProvider implements QuoteProvider {

  constructor() {
    if (!CONFIG.IEX_API_KEY) {
      throw new Error('IEX API key not set!');
    }
  }  

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    const shortSymbols = getShortSymbols(symbols);
    const symbolsMap = mapStringKeyValues(shortSymbols, symbols);
    const symbolsStr = shortSymbols.join(',');

    const response = await axios.get(`https://cloud.iexapis.com/stable/tops/last?token=${CONFIG.IEX_API_KEY}&symbols=${symbolsStr}`);
    const quotes: IEXQuote[] = response.data;
    const result: Asset[] = [];
    for (const quote of quotes) {
      if (symbolsMap[quote.symbol]) {
        result.push({
          currency: 'USD',
          price: quote.price,
          symbol: symbolsMap[quote.symbol],
        });
      }
    }
    return result;
  }

  getBondQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.BOND);
  }

  getCommodityQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.FOREX);
  }

  async getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.MUTUAL_FUND);
  }

  getSupportedMarkets(): string[] {
    return ['ARCX', 'XNGS', 'EDGX', 'BATS', 'EDGA', 'XCHI', 'BATY', 'XPHL', 'XNYS', 'XBOS', 'IEXG', 'XCIS', 'XASE', 'XNAS', 'XCBO'];
  }

  getId(): string {
    return 'IEX';
  }
}

// register as quote provider
export const iexQuoteProvider = new IEXQuoteProvider();
