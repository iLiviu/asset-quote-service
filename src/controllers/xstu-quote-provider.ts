import axios from 'axios';

import logger from '../logger';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

/**
 * Provide bond and stock quotes from Boerse Stuttgart (DE)
 */
export class XSTUQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols, AssetType.STOCK);
  }

  async getBondQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols, AssetType.BOND);
  }

  getCommodityQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['XSTU'];
  }

  getId(): string {
    return 'XSTU';
  }

  private async getAssetQuotes(symbols: string[], assetsType: AssetType): Promise<Asset[]> {
    const promises: Array<Promise<Asset>> = [];
    for (const symbol of symbols) {
      const promise = this.getAssetQuote(symbol, assetsType);
      promises.push(promise);
    }
    const assets = await Promise.all(promises);
    return assets;
  }

  private async getAssetQuote(fullSymbol: string, assetType: AssetType): Promise<Asset> {
    const symbolParts = parseSymbol(fullSymbol);
    try {
      const response = await axios.get('https://www.boerse-stuttgart.de/en/stock-exchange/tools-and-services/' +
        `product-finder/extended-search/search-result/?searchterm=${symbolParts.shortSymbol}`);
      const htmlBody = response.data;
      let currency = 'USD';
      // extract quote
      let regex = /[Ll]ast(\/yield)?\s*<span[^>]*>[^<]*<\/span>\s*<\/td>\s*<td>\s*<span[^>]*>\s*([0-9,.]+)/g;
      let match = regex.exec(htmlBody);
      if (match) {
        const price = match[2].replace('.', '').replace(',', '.');
        // extract trading currency
        regex = /Trading currency(\s*\/ Note)?\s*<a[^>]*>[^<]*<\/a>\s*<\/td>\s*<td[^>]*>\s*([^\/<]+)(\/ percent)?/g;
        match = regex.exec(htmlBody);
        let percentPrice: boolean = false;
        if (match) {
          const currencyStr = match[2].trim();
          if (currencyStr === 'Euro') {
            currency = 'EUR';
          } else if (currencyStr === 'US Dollar') {
            currency = 'USD';
          } else {
            currency = currencyStr;
          }
          percentPrice = (match[3] === '/ percent');
        }

        return {
          currency,
          percentPrice,
          price: +price,
          symbol: fullSymbol,
        };

      }
    } catch (err) {
      logger.error(`Could not get quote for symbol "${fullSymbol}": ${err} `);
    }
    return {
      currency: null,
      price: null,
      symbol: fullSymbol,
    };

  }
}

// register as quote provider
export const xstuQuoteProvider = new XSTUQuoteProvider();
