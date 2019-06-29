import axios from 'axios';

import logger from '../logger';
import { Asset, AssetType, AssetTypeNotSupportedError, parseSymbol, QuoteProvider, isValidISIN } from './quote-provider';

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

/**
 * Provide bond and stock quotes from Boerse Frankfurt (DE)
 */
export class XETRQuoteProvider implements QuoteProvider {

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
      let isin = symbolParts.shortSymbol;
      if (!isValidISIN(isin)) {
        // we need to find the asset's ISIN
        let searchResponse = await axios.get('https://api.boerse-frankfurt.de/global_search/limitedsearch/en?searchTerms=' + isin);
        const results: XETRSearchResult[][] = searchResponse.data;
        if (results.length > 0 && results[0].length > 0) {
          isin = results[0][0].isin;
        } else {
          isin = null;
        }
      }
      if (isin) {
        let response = await axios.get('https://api.boerse-frankfurt.de/composite/multiple_widget?' +
          'widgetUris=/data/instrument_information%3Fisin%3D' + isin +
          '&widgetUris=/data/etp_master_data%3Fisin%3D' + isin +
          '&widgetUris=%2Fdata%2Fmaster_data_bond%3Fisin%3D' + isin);
        const widgets = response.data;
        const infoWidget: WidgetResponse = widgets['/data/instrument_information?isin=' + isin];
        const info: InstrumentInformation = infoWidget.data;
        const etpInfoWidget: WidgetResponse = widgets['/data/etp_master_data?isin=' + isin];
        let etpInfo: ETPWidgetData;
        if (etpInfoWidget.statusCode === 2000) {
          etpInfo = etpInfoWidget.data;
        }
        const bondInfoWidget: WidgetResponse = widgets['/data/master_data_bond?isin=' + isin];
        let bondInfo: BondWidgetData;
        if (bondInfoWidget.statusCode === 200) {
          bondInfo = bondInfoWidget.data;
        }

        if (info && info.defaultMic) {

          response = await axios.get('https://api.boerse-frankfurt.de/data/price_information?' +
            'isin=' + isin +
            '&mic=' + info.defaultMic);
          if (response.data.startsWith('data:')) {
            const priceInfo: PriceInformation = JSON.parse(response.data.substr(5));
            if (priceInfo) {
              if (priceInfo.lastPrice) {
                price = priceInfo.lastPrice;
              }
              if (price) {
                let currency = 'EUR';
                if (etpInfo) {
                  currency = etpInfo.tradingCurrency;
                } else if (bondInfo) {
                  currency = bondInfo.issueCurrency;
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
