import axios from 'axios';

import logger from '../logger';
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

/**
 * Provide bond and stock quotes from Morningstar
 */
export class MorningstarQuoteProvider implements QuoteProvider {

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
      if (isValidISIN(symbolParts.shortSymbol)) {
        symbolParts.marketCode = '';
        const response = await axios.get(`https://www.morningstar.com/api/v2/search/securities/5/usquote-v2/?q=${symbolParts.shortSymbol}`);
        const data: MorningstarSearchResponse = response.data;
        if (data.result.code === 0 && data.m.length > 0 && data.m[0].r.length > 0) {
          const details = data.m[0].r[0];
          symbolParts.marketCode = details.LS01Z;
          symbolParts.shortSymbol = details.OS001;
        }
      }
      if (symbolParts.marketCode !== '' && symbolParts.shortSymbol !== '') {
        let response = await axios.get(`https://www.morningstar.com/stocks/` +
          `${symbolParts.marketCode}/${symbolParts.shortSymbol}/quote.html`);
        const htmlBody = response.data;
        // extract quote
        let regex = /name="secId"[^>]+content="([^"]+)/g;
        let match = regex.exec(htmlBody);
        if (match) {
          const securityId = match[1];
          regex = /name="securityType"[^>]+content="([^"]+)/g;
          match = regex.exec(htmlBody);
          if (match) {
            const securityType = match[1];
            let realtimeToken;
            let apiKey;
            regex = /name="realTimeToken"[^>]+content="([^"]+)/g;
            match = regex.exec(htmlBody);
            if (match) {
              realtimeToken = match[1];
            }
            regex = /name="apigeeKey"[^>]+content="([^"]+)/g;
            match = regex.exec(htmlBody);
            if (match) {
              apiKey = match[1];
            }
            if (realtimeToken && apiKey) {

              let url: string;
              if (securityType === 'ST') {
                url = `https://api-global.morningstar.com/sal-service/v1/stock/realTime/v3/${securityId}/data`;
              } else if (securityType === 'FE') {
                url = `https://api-global.morningstar.com/sal-service/v1/etf/quote/miniChartRealTimeData/${securityId}/data?ts=0`;
              }
              if (url) {
                response = await axios.get(url, {
                  headers: {
                    'apikey': apiKey,
                    'x-api-realtime-e': realtimeToken,
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
