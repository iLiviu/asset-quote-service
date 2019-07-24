import axios from 'axios';
import EventSource from 'eventsource';

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
  isin: string;
  info: InstrumentInformation;
  etpInfo: ETPWidgetData;
  bondInfo: BondWidgetData;
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
          bondInfo: null,
          etpInfo: null,
          info: null,
          isin: null,
        };
        this.cachedInfos[fullSymbol] = security;
      }

      if (!security.isin) {
        if (isValidISIN(symbolParts.shortSymbol)) {
          security.isin = symbolParts.shortSymbol;
        } else {
          // we need to find the asset's ISIN
          const searchResponse = await axios.get('https://api.boerse-frankfurt.de/global_search/limitedsearch/en?searchTerms=' +
            symbolParts.shortSymbol);
          const results: XETRSearchResult[][] = searchResponse.data;
          if (results.length > 0 && results[0].length > 0) {
            security.isin = results[0][0].isin;
          }
        }
      }
      if (security.isin) {
        if (!security.info) {
          const response = await axios.get('https://api.boerse-frankfurt.de/composite/multiple_widget?' +
            'widgetUris=/data/instrument_information%3Fisin%3D' + security.isin +
            '&widgetUris=/data/etp_master_data%3Fisin%3D' + security.isin +
            '&widgetUris=%2Fdata%2Fmaster_data_bond%3Fisin%3D' + security.isin);
          const widgets = response.data;
          const infoWidget: WidgetResponse = widgets['/data/instrument_information?isin=' + security.isin];
          security.info = infoWidget.data;
          const etpInfoWidget: WidgetResponse = widgets['/data/etp_master_data?isin=' + security.isin];
          if (etpInfoWidget.statusCode === 2000) {
            security.etpInfo = etpInfoWidget.data;
          }
          const bondInfoWidget: WidgetResponse = widgets['/data/master_data_bond?isin=' + security.isin];
          if (bondInfoWidget.statusCode === 200) {
            security.bondInfo = bondInfoWidget.data;
          }
        }

        if (security.info && security.info.defaultMic) {
          const pricePromise = new Promise<PriceInformation>((resolve, reject) => {
            const eventSource = new EventSource('https://api.boerse-frankfurt.de/data/price_information?' +
              'isin=' + security.isin +
              '&mic=' + security.info.defaultMic);
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
              if (security.etpInfo) {
                currency = security.etpInfo.tradingCurrency;
              } else if (security.bondInfo) {
                currency = security.bondInfo.issueCurrency;
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
