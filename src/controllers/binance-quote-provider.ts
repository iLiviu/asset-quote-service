import axios from 'axios';

import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

interface BinanceQuote {
  symbol: string;
  price: string;
}

interface CurrencyPairInfo {
  symbol: string;
  baseCurrency: string;
}

/**
 * Provide cryptocurrency quotes from Binance Exchange
 */
export class BinanceQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.STOCK);
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
    const requestedSymbols: Dictionary<CurrencyPairInfo> = {};
    const quotes: Asset[] = [];
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);
      let symbol = symbolParts.shortSymbol.toUpperCase();
      let currency = 'USD';

      // check if symbol was provided instead of currency pair, and fix it by assuming USD pair
      if (symbol.length < 4) {
        symbol = symbol + 'USDT';
      } else {
        // identify base currency
        if (!symbol.match(/USD.?$/i)) {
          // non usd pair, assume 3 letter currency
          currency = symbol.substr(symbol.length - 3);
        }
      }
      requestedSymbols[symbol] = {symbol: fullSymbol, baseCurrency: currency };
    }

    const response = await axios.get('https://api.binance.com/api/v3/ticker/price');
    const binanceQuotes: BinanceQuote[] = response.data;

    for (const quote of binanceQuotes) {
      const symbolInfo = requestedSymbols[quote.symbol];
      if (symbolInfo) {
        quotes.push({
          currency: symbolInfo.baseCurrency,
          price: +quote.price,
          symbol: symbolInfo.symbol,
        });
        delete requestedSymbols[quote.symbol];
      }
    }
    return quotes;
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['BINANCE'];
  }

  getId(): string {
    return 'Binance';
  }
}

// register as quote provider
export const binanceQuoteProvider = new BinanceQuoteProvider();
