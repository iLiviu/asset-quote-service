import axios, { AxiosResponse } from 'axios';

import logger from '../logger';
import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, isValidISIN, parseSymbol, QuoteProvider } from './quote-provider';

interface MorningstarQuote {
  lastPrice: number;
  currencyCode: string;
}

interface MSecurityDetails {
  /**
   * exchange code
   */
  LS01Z: string;
  /**
   * short symbol
   */
  OS001: string;
  /**
   * title
   */
  OS63I: string;
  /**
   * currency
   */
  OS05M: string;
}
interface MSearchResult {
  r: MSecurityDetails[];
}

interface MApiResult {
  code: number;
  msg: string;
}

interface MorningstarSearchResponse {
  m: MSearchResult[];
  result: MApiResult;
}

interface SecurityInfo {
  id: string;
  isETF: boolean;
}

/**
 * Provide bond and stock quotes from Morningstar
 */
export class MorningstarQuoteProvider implements QuoteProvider {
  /**
   * stores cached security info (internal id, and if security is a stock or ETF) to avoid searching for the info
   * on every quote request.
   */
  private securityInfos: Dictionary<SecurityInfo> = {};

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

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return [];
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getId(): string {
    return 'Morningstar';
  }

  private async getAssetQuotes(symbols: string[]): Promise<Asset[]> {
    const promises: Array<Promise<Asset>> = [];
    for (const symbol of symbols) {
      const promise = this.getAssetQuote(symbol);
      promises.push(promise);
    }
    const assets = await Promise.all(promises);
    return assets;
  }

  private async getAssetQuote(fullSymbol: string): Promise<Asset> {
    const symbolParts = parseSymbol(fullSymbol);
    try {
      let securityId: string;
      let isETF = false;
      const security = this.securityInfos[fullSymbol];
      if (security) {
        securityId = security.id;
        isETF = security.isETF;
      } else {
        if (isValidISIN(symbolParts.shortSymbol)) {
          symbolParts.marketCode = '';
          const response = await axios.get(`https://www.morningstar.com/api/v2/search/securities/5/usquote-v2/?q=` +
            `${symbolParts.shortSymbol}`);
          const data: MorningstarSearchResponse = response.data;
          if (data.result.code === 0 && data.m.length > 0 && data.m[0].r.length > 0) {
            const details = data.m[0].r[0];
            symbolParts.marketCode = details.LS01Z;
            symbolParts.shortSymbol = details.OS001;
          }
        }
        if (symbolParts.marketCode !== '' && symbolParts.shortSymbol !== '') {
          let response: AxiosResponse<any>;
          // surround in try..catch because we get an error if the security is an ETF and we search as stock
          try {
            response = await axios.get(`https://www.morningstar.com/stocks/` +
              `${symbolParts.marketCode}/${symbolParts.shortSymbol}/quote`);
          } catch (err) {
            if (err && err.response.status === 404) {
              response = await axios.get(`https://www.morningstar.com/etfs/` +
                `${symbolParts.marketCode}/${symbolParts.shortSymbol}/quote`);
              isETF = true;
            } else {
              throw err;
            }
          }
          const htmlBody = response.data;
          // extract quote
          let regex = /.secId=([a-z])/g;
          let match = regex.exec(htmlBody);
          if (match) {
            const securityIdIdx = match[1].charCodeAt(0) - 0x61;
            regex = /}}\("?([^,]+?)"?,"?([^,]+?)"?,"?([^,]+?)"?,"?([^,]+?)"?,"?([^,]+?)"?,"?([^,]+?)"?,"?([^,]+?)"?,/g;
            match = regex.exec(htmlBody);
            if (match && securityIdIdx < 8) {
              securityId = match[securityIdIdx + 1];
              this.securityInfos[fullSymbol] = {
                id: securityId,
                isETF,
              };
            }
          }
        }
      }

      if (securityId) {
        const realtimeToken = 'eyJlbmMiOiJBMTI4R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ.XmuAS3x5r-0MJuwLDdD4jNC6zjsY7HAFNo2VdvGg6jGc' +
          'j4hZ4NaJgH20ez313H8An9UJrsUj8ERH0R8UyjQu2UGMUnJ5B1ooXFPla0LQEbN_Em3-IG84YPFcWVmEgcs1Fl2jjlKHVqZp04D21UvtgQ4xyPwQ-Q' +
          'DdTxHqyvSCpcE.ACRnQsNuTh1K_C9R.xpLNZ8Cc9faKoOYhss1CD0A4hG4m0M7-LZQ0fISw7NUHwzQs2AEo9ZXfwOvAj1fCbcE96mbKQo8gr7Oq1a2-p' +
          'iYXM1X5yNMcCxEaYyGinpnf6PGqbdr6zbYZdqyJk0KrxWVhKSQchLJaLGJOts4GlpqujSqJObJQcWWbkJQYKG9K7oKsdtMAKsHIVo5-0BCUbjKVnHJNsY' +
          'wTsI7xn2Om8zGm4A.nBOuiEDssVFHC_N68tDjVA';
        const apiKey = 'lstzFDEOhfFNMLikKa0am9mgEKLBl49T';

        let url: string;
        if (!isETF) {
          url = `https://api-global.morningstar.com/sal-service/v1/stock/realTime/v3/${securityId}/data`;
        } else {
          url = `https://api-global.morningstar.com/sal-service/v1/etf/quote/miniChartRealTimeData/${securityId}/data?ts=0`;
        }
        if (url) {
          const response = await axios.get(url, {
            headers: {
              'ApiKey': apiKey,
              'X-API-REALTIME-E': realtimeToken,
            },
          });
          const quote: MorningstarQuote = response.data;
          if (quote.lastPrice) {
            return {
              currency: quote.currencyCode,
              price: quote.lastPrice,
              symbol: fullSymbol,
            };
          }
        }
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
}

// register as quote provider
export const morningstarQuoteProvider = new MorningstarQuoteProvider();
