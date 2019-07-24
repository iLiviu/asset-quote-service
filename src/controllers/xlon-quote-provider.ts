import axios from 'axios';

import logger from '../logger';
import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, isValidISIN, parseSymbol, QuoteProvider } from './quote-provider';

interface XLONSearchQuote {
  title: string;
  link: string;
  symbol1: string;
}

/**
 * Provide bond and stock quotes from London Stock Exchange (GB)
 */
export class XLONQuoteProvider implements QuoteProvider {
  private xlonSymbols: Dictionary<string> = {};

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

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['XLON'];
  }

  getId(): string {
    return 'XLON';
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

  /**
   * Get quote for an asset. Checks format of symbol to go to appropriate page
   * @param fullSymbol symbol can be either a ticker or ISIN
   */
  private async getAssetQuote(fullSymbol: string): Promise<Asset> {
    try {
      const symbolParts = parseSymbol(fullSymbol);
      if (isValidISIN(symbolParts.shortSymbol)) {
        return await this.getISINQuote(fullSymbol);
      } else {
        return await this.getShortSymbolQuote(fullSymbol);
      }
    } catch (err) {
      logger.error(`Could not get quote for symbol "${fullSymbol}": ${err}`);
      return {
        currency: null,
        price: null,
        symbol: fullSymbol,
      };
    }
  }

  /**
   * Get quote for an asset if ticker is provided as symbol
   * @param fullSymbol ticker symbol
   * @return Asset quote
   */
  private async getShortSymbolQuote(fullSymbol: string): Promise<Asset> {
    const symbolParts = parseSymbol(fullSymbol);
    const response = await axios.get('https://m.londonstockexchange.com/exchange/mobile/stocks/summary.html?tidm=' +
      symbolParts.shortSymbol);
    const htmlBody = response.data;
    // extract quote
    const regex = /<span>Price<\/span>(\s*<[^>]*>[^<]*<[^>]*>){2,2}\s*<\/div>\s*<div[^>]*>\s*<span[^>]*>([0-9.,]+)/g;
    const match = regex.exec(htmlBody);
    let price: number = null;
    if (match) {
      price = +match[2];
    }
    if (price) {

      return {
        currency: '',
        price,
        symbol: fullSymbol,
      };

    } else {
      return {
        currency: null,
        price: null,
        symbol: fullSymbol,
      };
    }
  }

  /**
   * Get quote for an asset if the symbol is an ISIN
   * @param fullSymbol symbol in ISIN format
   * @return Asset quote
   */
  private async getISINQuote(fullSymbol: string): Promise<Asset> {
    const symbolParts = parseSymbol(fullSymbol);
    let xlonSymbol = this.xlonSymbols[fullSymbol];
    if (!xlonSymbol) {
      const response = await axios.get('https://www.londonstockexchange.com/exchange/searchengine/all/json/search.html?q=' +
        symbolParts.shortSymbol);
      const quotes: XLONSearchQuote[] = response.data.quotes;
      if (quotes.length > 0) {
        xlonSymbol = quotes[0].symbol1;
        if (xlonSymbol) {
          this.xlonSymbols[fullSymbol] = xlonSymbol;
        }
      }
    }
    if (xlonSymbol) {
      const response = await axios.get(`https://www.londonstockexchange.com/exchange/prices-and-markets/stocks/summary/company-summary/` +
        `${xlonSymbol}.html`);
      const htmlBody = response.data;
      // extract quote
      const regex = /<td class="name">Price&nbsp;\(([^)]+)\)<\/td>\s*<td>([0-9.]+)/g;
      const match = regex.exec(htmlBody);
      if (match) {
        let price = +match[2];
        let currency = match[1];
        if (currency === 'GBX') { // quote is in pence
          currency = 'GBP';
          price = price / 100;
        }
        return {
          currency,
          price,
          symbol: fullSymbol,
        };

      }
    }

    return {
      currency: null,
      price: null,
      symbol: fullSymbol,
    };
  }
}

// register as quote provider
export const xlonQuoteProvider = new XLONQuoteProvider();
