import axios from 'axios';

import logger from '../logger';
import { Dictionary } from '../models/dictionary';
import {
  Asset, AssetType, AssetTypeNotSupportedError, mapStringKeyValues, parseSymbol, QuoteProvider,
} from './quote-provider';

// map MIC codes to yahoo short exchange codes
const YAHOO_EXCHANGE_CODES: Dictionary<string> = {
  XCBT: 'CBT',
  XCME: 'CME',
  IFUS: 'NYB',
  XNYM: 'NYM',
  XBUE: 'BA',
  XWBO: 'VI',
  XASX: 'AX',
  XBRU: 'BR',
  BVMF: 'SA',
  XTSE: 'TO',
  XCNQ: 'CN',
  NEOE: 'NE',
  XTSX: 'V',
  XSGO: 'SN',
  XSSC: 'SS',
  XSEC: 'SZ',
  XPRA: 'PR',
  XCSE: 'CO',
  XCAI: 'CA',
  XTAL: 'TL',
  XHEL: 'HE',
  XPAR: 'PA',
  XBER: 'BE',
  XFRA: 'F',
  XETR: 'DE',
  XHAM: 'HM',
  XHAN: 'HA',
  XDUS: 'DU',
  XMUN: 'MU',
  XSTU: 'SG',
  XATH: 'AT',
  XHKG: 'HK',
  XBUD: 'BD',
  XICE: 'IC',
  XBOM: 'BO',
  XNSE: 'NS',
  XIDX: 'JK',
  XDUB: 'IR',
  XTAE: 'TA',
  ETLX: 'TI',
  XMIL: 'MI',
  XTKS: 'T',
  XRIS: 'RG',
  NASB: 'VS',
  XKLS: 'KL',
  BIVA: 'MX',
  XAMS: 'AS',
  XNZE: 'NZ',
  XOSL: 'OL',
  XLIS: 'LS',
  DSMD: 'QA',
  MISX: 'ME',
  XSES: 'SI',
  XJSE: 'JO',
  XKRX: 'KS',
  XKOS: 'KQ',
  XMAD: 'MC',
  XSAU: 'SAU',
  XOME: 'ST',
  XSWX: 'SW',
  XTAI: 'TW',
  XBKK: 'BK',
  XIST: 'IS',
  XLON: 'L',
  BVCA: 'CR',
};

interface YFinanceQuote {
  currency: string;
  symbol: string;
  quoteType: string;
  regularMarketPrice: number;
}

interface YFinanceQuoteResponse {
  result: YFinanceQuote[];
  error: string;
}

interface YFinanceRequestResponse {
  quoteResponse: YFinanceQuoteResponse;
}

/**
 * Provide stock quotes from Yahoo Finance
 */
export class YFinanceQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    const formattedSymbols: string[] = [];
    for (const fullSymbol of symbols) {
      const symbolParts = parseSymbol(fullSymbol);
      const yMarketCode = YAHOO_EXCHANGE_CODES[symbolParts.marketCode];
      if (yMarketCode) {
        formattedSymbols.push(symbolParts.shortSymbol + '.' + yMarketCode);
      } else {
        formattedSymbols.push(symbolParts.shortSymbol);
      }
    }
    const symbolsMap = mapStringKeyValues(formattedSymbols, symbols);
    const symbolsStr = formattedSymbols.join(',');
    const result: Asset[] = [];
    try {
      const response = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote?' +
        'lang=en-US&region=US&corsDomain=finance.yahoo.com&symbols=' + symbolsStr);
      const yResponse: YFinanceRequestResponse = response.data;
      const quotes: YFinanceQuote[] = yResponse.quoteResponse.result;
      for (const quote of quotes) {
        if (symbolsMap[quote.symbol]) {
          result.push({
            currency: quote.currency,
            price: quote.regularMarketPrice,
            symbol: symbolsMap[quote.symbol],
          });
        }
      }
    } catch (err) {
      logger.error(`Could not get YFinance quotes for ${symbolsStr}: ${err}`);
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
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return ['XCBT', 'XCME', 'IFUS', 'XNYM', 'XBUE', 'XWBO', 'XASX', 'XBRU', 'BVMF', 'XTSE', 'XCNQ', 'NEOE', 'XTSX', 'XSGO',
      'XSSC', 'XSEC', 'XPRA', 'XCSE', 'XCAI', 'XTAL', 'XHEL', 'XPAR', 'XBER', 'XFRA', 'XETR', 'XHAM', 'XHAN', 'XDUS', 'XMUN',
      'XSTU', 'XATH', 'XHKG', 'XBUD', 'XICE', 'XBOM', 'XNSE', 'XIDX', 'XDUB', 'XTAE', 'ETLX', 'XMIL', 'XTKS', 'XRIS', 'NASB',
      'XKLS', 'BIVA', 'XAMS', 'XNZE', 'XOSL', 'XLIS', 'DSMD', 'MISX', 'XSES', 'XJSE', 'XKRX', 'XKOS', 'XMAD', 'XSAU', 'XOME',
      'XSWX', 'XTAI', 'XBKK', 'XIST', 'XLON', 'BVCA'];
  }

  getId(): string {
    return 'YahooFinance';
  }
}

// register as quote provider
export const yFinanceQuoteProvider = new YFinanceQuoteProvider();
