import axios from 'axios';

import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

interface BinanceQuote {
  symbol: string;
  price: string;
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
    const requestedSymbols: Dictionary<string> = {};
    const quotes: Asset[] = [];
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);

      let symbol = symbolParts.shortSymbol.toUpperCase().replace(/USD$/i, 'USDT'); // binance uses USDT
      if (!symbol.match(/USDT$/i)) {
        symbol = symbol + 'USDT';
      }
      requestedSymbols[symbol] = fullSymbol;
    }

    const response = await axios.get('https://api.binance.com/api/v3/ticker/price');
    const binanceQuotes: BinanceQuote[] = response.data;

    for (const quote of binanceQuotes) {
      if (requestedSymbols[quote.symbol]) {
        quotes.push({
          currency: 'USD',
          price: +quote.price,
          symbol: requestedSymbols[quote.symbol],
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
