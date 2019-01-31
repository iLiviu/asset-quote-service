import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol } from "./quote-provider";
import axios from "axios";
import logger from '../logger';

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

  private async getAssetQuotes(symbols: string[], assetsType: AssetType): Promise<Asset[]> {
    let promises: Promise<Asset>[] = [];
    for (let symbol of symbols) {
      let promise = this.getAssetQuote(symbol, assetsType);
      promises.push(promise);
    }
    let assets = await Promise.all(promises);
    return assets;
  }

  private async getAssetQuote(fullSymbol: string, assetType: AssetType): Promise<Asset> {
    let symbolParts = parseSymbol(fullSymbol);
    try {
      let response = await axios.get('https://www.boerse-stuttgart.de/en/stock-exchange/tools-and-services/product-finder/extended-search/search-result/?searchterm=' + symbolParts.shortSymbol);
      let htmlBody = response.data;
      let currency = 'USD';
      //extract quote
      let regex = /[Ll]ast(\/yield)?\s*<span[^>]*>[^<]*<\/span>\s*<\/td>\s*<td>\s*<span[^>]*>\s*([0-9,.]+)/g;
      let match = regex.exec(htmlBody);
      if (match) {
        let price = match[2].replace('.', '').replace(',', '.');
        //extract trading currency
        regex = /Trading currency(\s*\/ Note)?\s*<a[^>]*>[^<]*<\/a>\s*<\/td>\s*<td[^>]*>\s*([^\/<]+)(\/ percent)?/g;
        match = regex.exec(htmlBody);
        let percentPrice: boolean = false;
        if (match) {
          let currencyStr = match[2].trim();
          if (currencyStr === 'Euro') {
            currency = 'EUR'
          } if (currencyStr === 'US Dollar') {
            currency = 'USD'
          } else {
            currency = currencyStr;
          }
          percentPrice = (match[3] === '/ percent');


        }

        return {
          currency: currency,
          price: +price,
          percentPrice: percentPrice,
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


  getSupportedMarkets(): string[] {
    return ['XSTU'];
  }

  getId(): string {
    return 'XSTU';
  }
}

//register as quote provider
export const xstuQuoteProvider = new XSTUQuoteProvider();



