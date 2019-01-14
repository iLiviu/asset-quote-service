import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol, isValidISIN } from "./quote-provider";
import axios from "axios";

interface XLONSearchQuote {
  title: string;
  link: string;
  symbol1: string;
}

/**
 * Provide bond and stock quotes from London Stock Exchange (GB)
 */
export class XLONQuoteProvider implements QuoteProvider {

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

  private async getAssetQuotes(symbols: string[]): Promise<Asset[]> {
    let promises: Promise<Asset>[] = [];
    for (let symbol of symbols) {
      let promise = this.getAssetQuote(symbol);
      promises.push(promise);
    }
    let assets = await Promise.all(promises);
    return assets;
  }

  /**
   * Get quote for an asset. Checks format of symbol to go to appropriate page
   * @param fullSymbol symbol can be either a ticker or ISIN
   */
  private getAssetQuote(fullSymbol: string): Promise<Asset> {
    let symbolParts = parseSymbol(fullSymbol);
    if (isValidISIN(symbolParts.shortSymbol)) {
      return this.getISINQuote(fullSymbol);
    } else {
      return this.getShortSymbolQuote(fullSymbol);
    }
  }

  /**
   * Get quote for an asset if ticker is provided as symbol
   * @param fullSymbol ticker symbol
   * @return Asset quote
   */
  private async getShortSymbolQuote(fullSymbol: string): Promise<Asset> {
    let symbolParts = parseSymbol(fullSymbol);
    let response = await axios.get('https://m.londonstockexchange.com/exchange/mobile/stocks/summary.html?tidm=' + symbolParts.shortSymbol);
    let htmlBody = response.data;
    let currency = 'USD';
    //extract quote
    let regex = /<span>Price<\/span>(\s*<[^>]*>[^<]*<[^>]*>){2,2}\s*<\/div>\s*<div[^>]*>\s*<span[^>]*>([0-9.,]+)/g;
    let match = regex.exec(htmlBody);
    let price: number = null;
    if (match) {
      price = +match[2];
    }
    if (price) {

      return {
        currency: '',
        price: price,
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
    let symbolParts = parseSymbol(fullSymbol);
    let response = await axios.get('https://www.londonstockexchange.com/exchange/searchengine/all/json/search.html?q=' + symbolParts.shortSymbol);
    let quotes: XLONSearchQuote[] = response.data.quotes;
    let xlonSymbol = '';
    if (quotes.length>0) {
      xlonSymbol = quotes[0].symbol1;
    }
    if (xlonSymbol) {
      response = await axios.get(`https://www.londonstockexchange.com/exchange/prices-and-markets/stocks/summary/company-summary/${xlonSymbol}.html`);
      let htmlBody = response.data;
      //extract quote
      let regex = /<td class="name">Price&nbsp;\(([^)]+)\)<\/td>\s*<td>([0-9.]+)/g;
      let match = regex.exec(htmlBody);
      if (match) {
        let price = +match[2];
        let currency = match[1];
        if (currency === 'GBX') { //quote is in pence
          currency = 'GBP';
          price = price / 100;
        }
        return {
          currency: currency,
          price: price,
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

  getSupportedMarkets(): string[] {
    return ['XLON'];
  }

  getId(): string {
    return 'XLON';
  }
}

//register as quote provider
export const xlonQuoteProvider = new XLONQuoteProvider();



