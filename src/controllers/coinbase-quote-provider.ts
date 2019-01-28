import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol } from "./quote-provider";
import axios from "axios";

interface CoinbaseQuote {
  trade_id: number;
  price: string;
  size: string;
  bid: string;
  ask: string;
  volume: string;
  time: string;
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
    let promises: Promise<Asset>[] = [];
    for (let symbol of symbols) {
      let promise = this.getCryptoCurrencyQuote(symbol);
      promises.push(promise);
    }
    let assets = await Promise.all(promises);
    return assets;
  }

  async getCryptoCurrencyQuote(fullSymbol: string): Promise<Asset> {
    let symbolParts = parseSymbol(fullSymbol);
    let symbol = symbolParts.shortSymbol;
    if (symbol.match(/[a-z]/i)) {
      symbol = symbol.toUpperCase();
      let currency = 'USD';
      //generate full symbol (including base currency)
      let regex = /(.+)(USD|EUR)$/g;
      let match = regex.exec(symbol);
      if (match) {
        symbol = match[1] + '-' + match[2];
        currency = match[2];
      } else {
        symbol = symbol + '-USD';
      }

      let response = await axios.get('https://api.pro.coinbase.com/products/' + symbol + '/ticker');
      let quote: CoinbaseQuote = response.data;
      return {
        price: +quote.price,
        symbol: fullSymbol,
        currency: currency,
      };
    } else {
      // symbol not supported
      return {
        price: null,
        symbol: fullSymbol,
        currency: null,
      };
    }

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



//register as quote provider
export const coinbaseQuoteProvider = new CoinbaseQuoteProvider();




