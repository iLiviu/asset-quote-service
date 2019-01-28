import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol } from "./quote-provider";
import axios from "axios";



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


  private async getAssetQuotes(symbols: string[]): Promise<Asset[]> {
    let promises: Promise<Asset>[] = [];
    for (let symbol of symbols) {
      let promise = this.getAssetQuote(symbol);
      promises.push(promise);
    }
    let assets = await Promise.all(promises);
    return assets;
  }


  private async getAssetQuote(fullSymbol: string): Promise<Asset> {
    let symbolParts = parseSymbol(fullSymbol);
    let response = await axios.get('https://markets.ft.com/data/funds/tearsheet/summary?s=' + symbolParts.shortSymbol);
    let htmlBody = response.data;
    //extract quote
    let regex = /overview__quote__bar[^>]*><li><span[^>]*>Price(\s*\(([^\)]+))?[^<]*<\/span><span[^>]*>([0-9.,]+)/g;
    let match = regex.exec(htmlBody);
    let price: number = null;
    let currency = 'USD';
    if (match) {
      price = +(match[3].replace(',', ''));
      currency = match[2];
    }
    if (price) {
      return {
        currency: currency,
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

  getId(): string {
    return 'FinancialTimes';
  }
}

//register as quote provider
export const ftQuoteProvider = new FTQuoteProvider();



