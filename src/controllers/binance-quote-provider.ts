import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol } from "./quote-provider";
import axios from "axios";
import { Dictionary } from "../models/dictionary";

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
      let requestedSymbols:Dictionary<string> = {};
      let quotes:Asset[] = [];
      for (let fullSymbol of symbols) {
        let symbolParts = parseSymbol(fullSymbol);

        let symbol = symbolParts.shortSymbol.toUpperCase().replace(/USD$/i,'USDT'); //binance uses USDT
        if (!symbol.match(/USDT$/i)) {
          symbol = symbol+'USDT';
        }
        requestedSymbols[symbol] = fullSymbol;
      }

      let response = await axios.get('https://api.binance.com/api/v3/ticker/price');
      let binanceQuotes: BinanceQuote[] = response.data;

      for (let quote of binanceQuotes) {
        if (requestedSymbols[quote.symbol]) {
          quotes.push({
            symbol: requestedSymbols[quote.symbol],
            price: +quote.price,
            currency: "USD",
          });
          delete requestedSymbols[quote.symbol];
        }
      }
      
    return quotes;


  }


  getSupportedMarkets(): string[] {
    return ['BINANCE'];
  }



  getId(): string {
    return 'Binance';
  }
}



//register as quote provider
export const binanceQuoteProvider = new BinanceQuoteProvider();


