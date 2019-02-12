import axios from 'axios';

import logger from '../logger';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

interface CoinbaseQuote {
  ask: string;
  bid: string;
  trade_id: number;
  price: string;
  size: string;
  time: string;
  volume: string;
}

/**
 * Provide cryptocurrency quotes from Coinbase Exchange
 */
export class CoinbaseQuoteProvider implements QuoteProvider {

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
    const promises: Array<Promise<Asset>> = [];
    for (const symbol of symbols) {
      const promise = this.getCryptoCurrencyQuote(symbol);
      promises.push(promise);
    }
    const assets = await Promise.all(promises);
    return assets;
  }

  async getCryptoCurrencyQuote(fullSymbol: string): Promise<Asset> {
    const symbolParts = parseSymbol(fullSymbol);
    let symbol = symbolParts.shortSymbol;
    if (symbol.match(/[a-z]/i)) {
      symbol = symbol.toUpperCase();
      let currency = 'USD';
      // generate full symbol (including base currency)
      const regex = /(.+)(USD|EUR)$/g;
      const match = regex.exec(symbol);
      if (match) {
        symbol = match[1] + '-' + match[2];
        currency = match[2];
      } else {
        symbol = symbol + '-USD';
      }

      try {
        const response = await axios.get('https://api.pro.coinbase.com/products/' + symbol + '/ticker');
        const quote: CoinbaseQuote = response.data;
        return {
          currency,
          price: +quote.price,
          symbol: fullSymbol,
        };
      } catch (err) {
        logger.error(`Could not get quote for symbol "${fullSymbol}": ${err}`);
      }
    }

    return {
      currency: null,
      price: null,
      symbol: fullSymbol,
    };

  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['COINBASE', 'GDAX'];
  }

  getId(): string {
    return 'Coinbase';
  }
}

// register as quote provider
export const coinbaseQuoteProvider = new CoinbaseQuoteProvider();
