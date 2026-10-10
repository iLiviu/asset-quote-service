import axios from 'axios';
import dateFormat from "dateformat";

import EventSource from 'eventsource';
import { createHash, randomUUID } from "node:crypto";

import logger from '../logger';
import { Dictionary } from '../models/dictionary';
import { Asset, AssetType, AssetTypeNotSupportedError, isValidISIN, parseSymbol, QuoteProvider } from './quote-provider';

interface XETRSearchResult {
  isin: string;
  type: string;
}

interface InstrumentInformation {
  isin: string;
  defaultMic: string;
  instrumentTypeKey: string;
}

interface PriceInformation {
  isin: string;
  lastPrice: number;
  currency: {
    originalValue: string;
  }
}

interface ETPWidgetData {
  isin: string;
  tradingCurrency: string;

}

interface BondWidgetData {
  isin: string;
  issueCurrency: string;
}

interface WidgetResponse {
  widgetUri: string;
  statusCode: number;
  data: any;
}

interface SecurityInfo {
  isin: string | undefined;
}

interface SecurityHeaders {
  "Client-Date": string;
  "X-Client-TraceId": string;
  "X-Security": string;
}

interface SecurityHeaderOptions {
  /**
   * The client salt/secret defined in environment/security bundle.
   * Default fallback is Börse Frankfurt's standard public front-end salt.
   */
  salt?: string;
  /**
   * Optional custom timestamp (defaults to new Date())
   */
  date?: Date;
  /**
   * Optional custom trace UUID
   */
  traceId?: string;
}

/**
 * Generates the security headers required by Boerse Frankfurt API endpoints.
 * Node.js variant using `node:crypto`.
 */
export function generateBoerseSecurityHeaders(
  options: SecurityHeaderOptions = {}
): SecurityHeaders {
  const date = options.date ?? new Date();
  const clientDate = (date).toISOString();
  const traceId = options.traceId ?? randomUUID();
  const salt = options.salt ?? 'af5a8d16eb5dc49f8a72b26fd9185475c7a'

  // Digest pattern: MD5(Client-Date + Salt) or MD5(Client-Date + TraceId + Salt)
  // Börse Frankfurt's Angular frontend builds the signature payload:
  const payload = `${clientDate}${traceId}${salt}`;
  const clientTraceId = createHash("md5").update(payload, "utf8").digest("hex");
  const xSecurity = createHash("md5").update(dateFormat(date, "yyyyMMddHHmm")).digest("hex");

  return {
    "Client-Date": clientDate,
    "X-Client-TraceId": clientTraceId,
    "X-Security": xSecurity
  };
}

function boerseAPIRequest(url: string): Promise<any> {

  const headers = generateBoerseSecurityHeaders({
    date: new Date(),
    traceId: url,
  });
  return axios.get(url, {
    headers: {
      "Client-Date": headers['Client-Date'],
      "X-Security": headers['X-Security'],
      "X-Client-TraceId": headers['X-Client-TraceId'],
    }
  });

}

/**
 * Provide bond and stock quotes from Boerse Frankfurt (DE)
 */
export class XETRQuoteProvider implements QuoteProvider {
  /**
   * caches the information of searched securities and use it next time to avoid searching again
   */
  private cachedInfos: Dictionary<SecurityInfo> = {};

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

  getSupportedMarkets(): string[] {
    return [];
  }

  getId(): string {
    return 'XETR';
  }

  private async getAssetQuotes(symbols: string[], assetsType: AssetType): Promise<Asset[]> {
    const promises: Array<Promise<Asset>> = [];
    for (const symbol of symbols) {
      const promise = this.getAssetQuote(symbol, assetsType);
      promises.push(promise);
    }
    const assets = await Promise.all(promises);
    return assets;
  }

  private async getAssetQuote(fullSymbol: string, assetType: AssetType): Promise<Asset> {
    let price: number = null;
    const symbolParts = parseSymbol(fullSymbol);
    try {
      let security = this.cachedInfos[fullSymbol];
      if (!security) {
        security = {
          isin: undefined,
        };
        this.cachedInfos[fullSymbol] = security;
      }

      if (!security.isin) {
        if (isValidISIN(symbolParts.shortSymbol)) {
          security.isin = symbolParts.shortSymbol;
        } else {
          // we need to find the asset's ISIN
          const searchResponse = await boerseAPIRequest('https://api.live.deutsche-boerse.com/v1/global_search/limitedsearch/en?searchTerms=' +
            symbolParts.shortSymbol);
          const results: XETRSearchResult[][] = searchResponse.data;
          if (results.length > 0 && results[0].length > 0) {
            security.isin = results[0][0].isin;
          }
        }
      }
      if (security.isin) {
        const pricePromise = new Promise<PriceInformation>((resolve, reject) => {
          const eventSource = new EventSource('https://api.live.deutsche-boerse.com/v1/data/price_information?' +
            'isin=' + security.isin
            //              '&mic=' + security.info.defaultMic
          );
          eventSource.addEventListener('message', (event: any) => {
            const pInfo: PriceInformation = JSON.parse(event.data);
            eventSource.close();
            resolve(pInfo);
          });
          eventSource.addEventListener('error', (event: any) => {
            eventSource.close();
            reject(event);
          });
        });
        const priceInfo = await pricePromise;

        if (priceInfo) {
          if (priceInfo.lastPrice) {
            price = priceInfo.lastPrice;
          }
          if (price) {
            let currency = 'EUR';
            if (priceInfo?.currency?.originalValue) {
              currency = priceInfo.currency.originalValue;
            } 

            return {
              currency,
              percentPrice: assetType === AssetType.BOND,
              price,
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
export const xetrQuoteProvider = new XETRQuoteProvider();
