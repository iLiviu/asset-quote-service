import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, SymbolNotSupportedError, parseSymbol } from "./quote-provider";
import axios from "axios";
import { Dictionary } from "../models/dictionary";


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

//numeric codes used by CME for commodities
const COMMODITY_CODES: Dictionary<CMESymbol> = {
  //metals
  "GOLD": { code: 437, symbol: 'GC' },
  "AU": { code: 437, symbol: 'GC' },
  "GC": { code: 437, symbol: 'GC' },
  "PLATINUM": { code: 446, symbol: 'PL' },
  "PT": { code: 446, symbol: 'PL' },
  "PL": { code: 446, symbol: 'PL' },
  "ALUMINIUM": { code: 7440, symbol: 'ALI' },
  "AL": { code: 7440, symbol: 'ALI' },
  "ALI": { code: 7440, symbol: 'ALI' },
  "SILVER": { code: 458, symbol: 'SI' },
  "AG": { code: 458, symbol: 'SI' },
  "SI": { code: 458, symbol: 'SI' },
  "COPPER": { code: 438, symbol: 'HG' },
  "CU": { code: 438, symbol: 'HG' },
  "HG": { code: 438, symbol: 'HG' },
  "PALLADIUM": { code: 445, symbol: 'PA' },
  "PD": { code: 445, symbol: 'PA' },
  "PA": { code: 445, symbol: 'PA' },

  //agricultural
  "CORN": { code: 300, symbol: 'ZC' },
  "ZC": { code: 300, symbol: 'ZC' },
  "SOYBEAN": { code: 320, symbol: 'ZS' },
  "ZS": { code: 320, symbol: 'ZS' },
  "LE": { code: 22, symbol: 'LE' }, //live cattle
  "ZW": { code: 323, symbol: 'ZW' }, //wheat

  //energy
  "OIL": { code: 425, symbol: 'CL' }, //crude oil
  "CL": { code: 425, symbol: 'CL' },
  "BZ": { code: 424, symbol: 'BZ' }, //brent oil
  "RB": { code: 429, symbol: 'RB' }, //gasoline
  "NG": { code: 444, symbol: 'NG' }, //natural gas

}

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
    /*
    let promises: Promise<Asset>[] = [];
    for (let symbol of symbols) {
      let promise = this.getCommodityQuote(symbol);
      promises.push(promise);
    }
    let assets = await Promise.all(promises);
    return assets;
    */
    let result: Asset[] = [];
    let cmeSymbols: CMESymbol[] = [];
    let userSymbols: Dictionary<string> = {};
    for (let fullSymbol of symbols) {
      let symbolParts = parseSymbol(fullSymbol);
      let symbol = symbolParts.shortSymbol; 
      if (symbol.match(/^X[A-Z]{2}$/i)) {
        //remove X in front of symbol
        symbol = symbol.substr(1);
      }
      let cmeSymbol = COMMODITY_CODES[symbol.toUpperCase()];
      if (cmeSymbol) {
        cmeSymbols.push(cmeSymbol);
        userSymbols[cmeSymbol.symbol] = fullSymbol;
      } else {
        //symbol not supported
        result.push({
          price: null,
          symbol: fullSymbol,
          currency: null,
        });
      }
    }

    if (cmeSymbols.length > 0) {
      let symbolIdsStr = '';
      for (let cmeSymbol of cmeSymbols) {
        symbolIdsStr += ',' + cmeSymbol.code;
      }
      symbolIdsStr = symbolIdsStr.substr(1);
      let response = await axios.get(`https://www.cmegroup.com/CmeWS/mvc/Quotes/FrontMonths?productIds=${symbolIdsStr}&venue=G&type=VOLUME`);
      let quotes: CMEQuote[] = response.data;
      for (let quote of quotes) {
        let cmeSymbol = COMMODITY_CODES[quote.productCode];
        if (cmeSymbol) {
          result.push({
            currency: 'USD',
            price: +quote.last.replace("'",'.'),
            symbol: userSymbols[cmeSymbol.symbol],
          })
        }
      }
    }


    return result;
  }

  private async getCommodityQuote(symbol: string): Promise<Asset> {
    let userSymbol = symbol;
    if (symbol.match(/^X[A-Z]{2}$/i)) {
      //remove X in front of symbol
      symbol = symbol.substr(1);
    }
    let cmeSymbol = COMMODITY_CODES[symbol.toUpperCase()];
    if (cmeSymbol) {

      let response = await axios.get(`https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/${cmeSymbol.code}/G?pageSize=50`);
      let body: CMERequestResponse = response.data;
      let price: number;
      for (let quote of body.quotes) {
        if (quote.last !== '-') {
          price = +quote.last;
          break;
        }
      }
      return {
        price: price,
        symbol: userSymbol,
        currency: 'USD',
      };
    } else {
      //symbol not supported
      return {
        price: null,
        symbol: userSymbol,
        currency: null,
      };
    }
  }

  getSupportedMarkets(): string[] {
    return ['CME'];
  }

  getId(): string {
    return 'CME';
  }
}

//register as quote provider
export const cmeQuoteProvider = new CMEQuoteProvider();



