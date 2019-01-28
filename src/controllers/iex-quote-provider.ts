import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol, getShortSymbols, mapStringKeyValues } from "./quote-provider";
import axios from "axios";
import { Dictionary } from "../models/dictionary";

interface IEXQuote {
  symbol: string;
  price: number;
  size: number;
  time: number;
}

interface IEXCryptoQuote {
  symbol: string;
  latestPrice: number;
}


/**
 * Provide cryptocurrency and stock quotes(north america) from IEX
 */
export class IEXQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    let shortSymbols = getShortSymbols(symbols);
    let symbolsMap = mapStringKeyValues(shortSymbols, symbols);
    let symbolsStr = shortSymbols.join(',');

    let response = await axios.get('https://api.iextrading.com/1.0/tops/last?symbols=' + symbolsStr);
    let quotes: IEXQuote[] = response.data;
    let result: Asset[] = [];
    for (let quote of quotes) {
      if (symbolsMap[quote.symbol]) {
        result.push({
          price: quote.price,
          symbol: symbolsMap[quote.symbol],
          currency: "USD",
        });
      }
    }
    return result;
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
    let requestedSymbols: Dictionary<string> = {};
    for (let fullSymbol of symbols) {
      let symbolParts = parseSymbol(fullSymbol);
      let symbol = symbolParts.shortSymbol.toUpperCase().replace(/USD$/i, 'USDT'); //iex only has USDT pairs for now
      if (!symbol.match(/USDT$/i)) {
        symbol = symbol + 'USDT';
      }
      requestedSymbols[symbol] = fullSymbol;
    }

    let response = await axios.get('https://api.iextrading.com/1.0/stock/market/crypto');
    let quotes: IEXCryptoQuote[] = response.data;
    let result: Asset[] = [];
    for (let quote of quotes) {
      if (requestedSymbols[quote.symbol]) {
        result.push({
          symbol: requestedSymbols[quote.symbol],
          price: +quote.latestPrice,
          currency: "USD",
        });
      }
    }


    return result;

  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['ARCX', 'XNGS', 'EDGX', 'BATS', 'EDGA', 'XCHI', 'BATY', 'XPHL', 'XNYS', 'XBOS', 'IEXG', 'XCIS', 'XASE', 'XNAS','XCBO'];
  }

  getId(): string {
    return 'IEX';
  }
}

//register as quote provider
export const iexQuoteProvider = new IEXQuoteProvider();



