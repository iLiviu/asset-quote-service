import axios from 'axios';

import logger from '../logger';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

/**
 * Provide bond and stock quotes from Boerse Frankfurt (DE)
 */
export class XETRQuoteProvider implements QuoteProvider {

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
    return [];
  }

  getId(): string {
    return 'XETR';
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
    let price: number = null;
    const symbolParts = parseSymbol(fullSymbol);
    try {
      const response = await axios.get('http://en.boerse-frankfurt.de/searchresults?_search=' + symbolParts.shortSymbol);
      const htmlBody = response.data;
      let currency = 'EUR';
      // extract quote
      let regex = / field="last"[^>]+jsvalue="([0-9.]+)/g;
      let match = regex.exec(htmlBody);
      if (match) {
        price = +match[1];
      } else {
        regex = /<strong>Last Price<\/strong>\s*<\/td>\s*<td[^>]*>\s*([0-9.,]+)/g;
        match = regex.exec(htmlBody);
        if (match) {
          price = +(match[1].replace('.', '').replace(',', '.'));
        }

      }
      if (price) {
        // extract trading currency
        regex = /<h2>Master Data<\/h2>[\s\S]*?Currency\s*<\/td>\s*<td[^>]*>([^<]+)/g;
        match = regex.exec(htmlBody);
        if (match) {
          const currencyStr = match[1].trim();
          if (currencyStr === 'Euro') {
            currency = 'EUR';
          } else if (currencyStr === 'US-Dollar') {
            currency = 'USD';
          } else {
            currency = currencyStr;
          }
        }

        return {
          currency,
          percentPrice: assetType === AssetType.BOND,
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
export const xetrQuoteProvider = new XETRQuoteProvider();
