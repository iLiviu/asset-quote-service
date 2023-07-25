import axios, { AxiosResponse } from 'axios';
import NodeCache from 'node-cache';
import querystring from 'querystring';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';


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

const CRUMB_CACHE_KEY = 'ycrumb';
const COOKIES_CACHE_KEY = 'ycookies';

const USERAGENT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Dnt': '1'
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
  private cache: NodeCache;

  constructor() {
    // we store yahoo session data in cache
    this.cache = new NodeCache({ stdTTL: 24 * 60 * 60 });
  }
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
      let crumb: string = this.cache.get(CRUMB_CACHE_KEY);
      let cookies = "";
      let response: AxiosResponse<any>;
      if (!crumb) {
        const jar = new CookieJar();
        const httpClient = wrapper(axios.create({ jar }));
        response = await httpClient.get('https://yahoo.com/',
          {
            headers: USERAGENT_HEADERS
          });
        // check if we need to agree to cookie policy
        if (response.request.res.responseUrl.indexOf('collectConsent') >= 0) {
          let sessionId: string;
          let regex = new RegExp('name=\?"sessionId\?"[^>]+value=\?"([^"\]+)', 'g');
          let match = regex.exec(response.data);
          if (match) {
            sessionId = match[1];
          }
          regex = new RegExp('name=\?"csrfToken\?"[^>]+value=\?"([^"\]+)', 'g');
          match = regex.exec(response.data);
          if (match) {
            const token = match[1];
            const postData = querystring.stringify({
              'csrfToken': token,
              'sessionId': sessionId,
              'originalDoneUrl': 'https://finance.yahoo.com/?guccounter=1',
              'namespace': 'yahoo',
              'agree': 'agree',
            });
            response = await httpClient.post(response.request.res.responseUrl, postData, {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...USERAGENT_HEADERS
              },
            });
          }
        }
        cookies = await jar.getCookieString('https://yahoo.com');
        this.cache.set(COOKIES_CACHE_KEY, cookies);
        response = await axios.get('https://query1.finance.yahoo.com/v1/test/getcrumb',
          {
            headers: {
              Cookie: cookies,
              ...USERAGENT_HEADERS
            },
          });
        crumb = response.data;
        this.cache.set(CRUMB_CACHE_KEY, crumb);
      } else {
        cookies = this.cache.get(COOKIES_CACHE_KEY);
      }
      response = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote',
        {
          headers: {
            Cookie: cookies,
            ...USERAGENT_HEADERS
          },
          params: {
            'crumb': crumb,
            'lang': 'en-US',
            'region': 'US',
            'corsDomain': 'finance.yahoo.com',
            'symbols': symbolsStr,
          }
        });
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
      this.cache.del([COOKIES_CACHE_KEY, CRUMB_CACHE_KEY]);
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
    throw new AssetTypeNotSupportedError(AssetType.FOREX);
  }

  async getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getStockQuotes(symbols);
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
