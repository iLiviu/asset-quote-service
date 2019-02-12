import axios from 'axios';

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

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    const shortSymbols = getShortSymbols(symbols);
    const symbolsMap = mapStringKeyValues(shortSymbols, symbols);
    const symbolsStr = shortSymbols.join(',');

    const response = await axios.get('https://api.iextrading.com/1.0/tops/last?symbols=' + symbolsStr);
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
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  async getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    const requestedSymbols: Dictionary<string> = {};
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);
      let symbol = symbolParts.shortSymbol.toUpperCase().replace(/USD$/i, 'USDT'); // iex only has USDT pairs for now
      if (!symbol.match(/USDT$/i)) {
        symbol = symbol + 'USDT';
      }
      requestedSymbols[symbol] = fullSymbol;
    }

    const response = await axios.get('https://api.iextrading.com/1.0/stock/market/crypto');
    const quotes: IEXCryptoQuote[] = response.data;
    const result: Asset[] = [];
    for (const quote of quotes) {
      if (requestedSymbols[quote.symbol]) {
        result.push({
          currency: 'USD',
          price: +quote.latestPrice,
          symbol: requestedSymbols[quote.symbol],
        });
      }
    }

    return result;
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
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
