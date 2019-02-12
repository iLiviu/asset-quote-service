import axios from 'axios';

import logger from '../logger';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

/**
 * Provide mutual fund quotes from Financial Times
 */
export class FTQuoteProvider implements QuoteProvider {
  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols);
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
    return [];
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols);
  }

  getId(): string {
    return 'FinancialTimes';
  }

  private async getAssetQuotes(symbols: string[]): Promise<Asset[]> {
    const promises: Array<Promise<Asset>> = [];
    for (const symbol of symbols) {
      const promise = this.getAssetQuote(symbol);
      promises.push(promise);
    }
    const assets = await Promise.all(promises);
    return assets;
  }

  private async getAssetQuote(fullSymbol: string): Promise<Asset> {
    const symbolParts = parseSymbol(fullSymbol);
    try {
      const response = await axios.get('https://markets.ft.com/data/funds/tearsheet/summary?s=' + symbolParts.shortSymbol);
      const htmlBody = response.data;
      // extract quote
      const regex = /overview__quote__bar[^>]*><li><span[^>]*>Price(\s*\(([^\)]+))?[^<]*<\/span><span[^>]*>([0-9.,]+)/g;
      const match = regex.exec(htmlBody);
      let price: number = null;
      let currency = 'USD';
      if (match) {
        price = +(match[3].replace(',', ''));
        currency = match[2];
      }
      if (price) {
        return {
          currency,
          price,
          symbol: fullSymbol,
        };
      }
    } catch (err) {
      logger.error(`Could not get quote for symbol "${fullSymbol}": ${err}`);
    }

    return {
      currency: null,
      price: null,
      symbol: fullSymbol,
    };
  }
}

// register as quote provider
export const ftQuoteProvider = new FTQuoteProvider();
