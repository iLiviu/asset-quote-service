import axios from 'axios';

import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider } from './quote-provider';

interface CMEQuote {
  last: string;
  productCode: string;
  productId: number;
}

interface CMERequestResponse {
  quotes: CMEQuote[];
}

interface CMESymbol {
  code: number;
  symbol: string;
}

// numeric codes used by CME for commodities
const COMMODITY_CODES: Dictionary<CMESymbol> = {
  // metals
  AU: { code: 437, symbol: 'GC' },
  GC: { code: 437, symbol: 'GC' },
  GOLD: { code: 437, symbol: 'GC' },
  PLATINUM: { code: 446, symbol: 'PL' },
  PT: { code: 446, symbol: 'PL' },
  PL: { code: 446, symbol: 'PL' },
  ALUMINIUM: { code: 7440, symbol: 'ALI' },
  AL: { code: 7440, symbol: 'ALI' },
  ALI: { code: 7440, symbol: 'ALI' },
  SILVER: { code: 458, symbol: 'SI' },
  AG: { code: 458, symbol: 'SI' },
  SI: { code: 458, symbol: 'SI' },
  COPPER: { code: 438, symbol: 'HG' },
  CU: { code: 438, symbol: 'HG' },
  HG: { code: 438, symbol: 'HG' },
  PALLADIUM: { code: 445, symbol: 'PA' },
  PD: { code: 445, symbol: 'PA' },
  PA: { code: 445, symbol: 'PA' },

  // agricultural
  CORN: { code: 300, symbol: 'ZC' },
  ZC: { code: 300, symbol: 'ZC' },
  SOYBEAN: { code: 320, symbol: 'ZS' },
  ZS: { code: 320, symbol: 'ZS' },
  LE: { code: 22, symbol: 'LE' }, // live cattle
  ZW: { code: 323, symbol: 'ZW' }, // wheat

  // energy
  OIL: { code: 425, symbol: 'CL' }, // crude oil
  CL: { code: 425, symbol: 'CL' },
  BZ: { code: 424, symbol: 'BZ' }, // brent oil
  RB: { code: 429, symbol: 'RB' }, // gasoline
  NG: { code: 444, symbol: 'NG' }, // natural gas
};

/**
 * Provide commodity quotes from CME futures
 */
export class CMEQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.STOCK);

  }

  getBondQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.BOND);
  }

  async getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  async getCommodityQuotes(symbols: string[]): Promise<Asset[]> {
    const result: Asset[] = [];
    const cmeSymbols: CMESymbol[] = [];
    const userSymbols: Dictionary<string> = {};
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);
      let symbol = symbolParts.shortSymbol;
      if (symbol.match(/^X[A-Z]{2}$/i)) {
        // remove X in front of symbol
        symbol = symbol.substr(1);
      }
      const cmeSymbol = COMMODITY_CODES[symbol.toUpperCase()];
      if (cmeSymbol) {
        cmeSymbols.push(cmeSymbol);
        userSymbols[cmeSymbol.symbol] = fullSymbol;
      } else {
        // symbol not supported
        result.push({
          currency: null,
          price: null,
          symbol: fullSymbol,
        });
      }
    }

    if (cmeSymbols.length > 0) {
      let symbolIdsStr = '';
      for (const cmeSymbol of cmeSymbols) {
        symbolIdsStr += ',' + cmeSymbol.code;
      }
      symbolIdsStr = symbolIdsStr.substr(1);
      const response = await axios.get(`https://www.cmegroup.com/CmeWS/mvc/Quotes/FrontMonths?` +
        `productIds=${symbolIdsStr}&venue=G&type=VOLUME`);
      const quotes: CMEQuote[] = response.data;
      for (const quote of quotes) {
        const cmeSymbol = COMMODITY_CODES[quote.productCode];
        if (cmeSymbol) {
          result.push({
            currency: 'USD',
            price: +quote.last.replace('\'', '.'),
            symbol: userSymbols[cmeSymbol.symbol],
          });
        }
      }
    }
    return result;
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['CME'];
  }

  getId(): string {
    return 'CME';
  }

  private async getCommodityQuote(symbol: string): Promise<Asset> {
    const userSymbol = symbol;
    if (symbol.match(/^X[A-Z]{2}$/i)) {
      // remove X in front of symbol
      symbol = symbol.substr(1);
    }
    const cmeSymbol = COMMODITY_CODES[symbol.toUpperCase()];
    if (cmeSymbol) {

      const response = await axios.get(`https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/${cmeSymbol.code}/G?pageSize=50`);
      const body: CMERequestResponse = response.data;
      let price: number;
      for (const quote of body.quotes) {
        if (quote.last !== '-') {
          price = +quote.last;
          break;
        }
      }
      return {
        currency: 'USD',
        price,
        symbol: userSymbol,
      };
    } else {
      // symbol not supported
      return {
        currency: null,
        price: null,
        symbol: userSymbol,
      };
    }
  }
}

// register as quote provider
export const cmeQuoteProvider = new CMEQuoteProvider();
