import { Request, Response } from 'express';
import NodeCache from 'node-cache';

import { CONFIG } from '../config';
import logger from '../logger';
import { Dictionary } from '../models/dictionary';
import { binanceQuoteProvider } from './binance-quote-provider';
import { bvbQuoteProvider } from './bvb-quote-provider';
import { cmeQuoteProvider } from './cme-quote-provider';
import { coinbaseQuoteProvider } from './coinbase-quote-provider';
import { fixerQuoteProvider } from './fixer-quote-provider';
import { ftQuoteProvider } from './ft-quote-provider';
import { iexQuoteProvider } from './iex-quote-provider';
import { morningstarQuoteProvider } from './morningstar-quote-provider';
import {
  Asset, AssetType, AssetTypeNotSupportedError, isValidISIN, isValidMIC, parseSymbol, QuoteError, QuoteProvider, quoteProviderService,
} from './quote-provider';
import { xetrQuoteProvider } from './xetr-quote-provider';
import { xlonQuoteProvider } from './xlon-quote-provider';
import { xstuQuoteProvider } from './xstu-quote-provider';
import { yFinanceQuoteProvider } from './yfinance-quote-provider';

interface QuoteProviderSymbols {
  provider: QuoteProvider;
  symbols: Dictionary<string>;
}

const SYMBOL_PATTERN = /[A-Z0-9.]/;

export class AssetQuoteRequestHandler {

  private cache: NodeCache;

  constructor() {
    // we store the quotes for assets in cache for 60 minutes
    this.cache = new NodeCache({ stdTTL: CONFIG.DEFAULT_CACHE_TTL });
  }

  /**
   * Handle HTTP request for stock quotes
   */
  stockRequest = (req: Request, res: Response) => {
    this.handleRequest(AssetType.STOCK, req, res);
  }

  /**
   * Handle HTTP request for cryptocurrency quotes
   */
  cryptocurrencyRequest = (req: Request, res: Response) => {
    this.handleRequest(AssetType.CRYPTOCURRENCY, req, res);
  }

  /**
   * Handle HTTP request for commodity quotes
   */
  commodityRequest = (req: Request, res: Response) => {
    this.handleRequest(AssetType.COMMODITY, req, res);
  }

  /**
   * Handle HTTP request for bond quotes
   */
  bondRequest = (req: Request, res: Response) => {
    this.handleRequest(AssetType.BOND, req, res);
  }

  forexRequest = (req: Request, res: Response) => {
    this.handleRequest(AssetType.FOREX, req, res);
  }

  mutualFundRequest = (req: Request, res: Response) => {
    this.handleRequest(AssetType.MUTUAL_FUND, req, res);
  }

  /**
   * Tell the client that the HTTP request is invalid
   * @param res HTTP Response object
   */
  private sendInvalidRequestResponse(res: Response) {
    res.status(400).json({ code: 400, message: 'Invalid request' });
  }

  /**
   * Quotes in pound sterling are usually provided in penny sterling, so we need to convert to pounds
   * @param asset asset to fix quote for
   */
  private fixAssetQuote(asset: Asset) {
    if (asset.currency === 'GBX' || asset.currency === 'GBp') {
      asset.price /= 100;
      asset.currency = 'GBP';
    }
  }

  /**
   * Get the quotes for a given list of symbols.
   * Format for each symbol is MARKET:SYMBOL or just SYMBOL. If MARKET is not provided
   * program will use the default quote provider
   * @param assetType the asset type to get quotes for
   * @param symbols list of symbols to get quotes for
   * @return list of quotes
   */
  private async getQuotes(symbols: string[], assetType: AssetType): Promise<Asset[]> {
    // remove incorrect symbols
    symbols = symbols.filter((symbol) => {
      const symbolParts = parseSymbol(symbol);
      if (symbolParts.marketCode.match(/^[A-Z0-9]{0,10}$/i)) {
        // allow up to 12 characters for symbol (for ISIN)
        return symbolParts.shortSymbol.match(/^[A-Z0-9.+_/-]{1,12}$/i);
      }
      return false;
    });

    let quotes: Asset[] = [];
    const requestSymbols: Dictionary<string> = {};
    const providersSymbolsMap: Dictionary<QuoteProviderSymbols> = {};
    for (let symbol of symbols) {
      symbol = symbol.trim().toUpperCase();
      const symbolParts = parseSymbol(symbol);
      if (symbolParts.shortSymbol !== '' && symbolParts.shortSymbol.match(SYMBOL_PATTERN)) {
        let quoteProvider: QuoteProvider = null;
        if (symbolParts.marketCode !== '') {
          quoteProvider = quoteProviderService.getQuoteProvider(symbolParts.marketCode);
        }
        if (!quoteProvider) {
          // no supported market provided, so use default quote provider for asset type
          if (assetType === AssetType.STOCK) {
            if (isValidISIN(symbolParts.shortSymbol)) {
              quoteProvider = xetrQuoteProvider;
            } else if (isValidMIC(symbolParts.marketCode)) {
              quoteProvider = morningstarQuoteProvider;
            } else {
              quoteProvider = iexQuoteProvider;
            }
          } else if (assetType === AssetType.BOND) {
            quoteProvider = xetrQuoteProvider;
          } else if (assetType === AssetType.COMMODITY) {
            quoteProvider = cmeQuoteProvider;
          } else if (assetType === AssetType.CRYPTOCURRENCY) {
            quoteProvider = binanceQuoteProvider;
          } else if (assetType === AssetType.FOREX) {
            quoteProvider = fixerQuoteProvider;
          } else if (assetType === AssetType.MUTUAL_FUND) {
            if (isValidISIN(symbolParts.shortSymbol)) {
              quoteProvider = ftQuoteProvider;
            } else {
              quoteProvider = yFinanceQuoteProvider;
            }
          } else {
            throw new AssetTypeNotSupportedError(assetType);
          }
        }

        if (quoteProvider) {
          // check cache first
          const cacheKey = quoteProvider.getId() + '_' + symbolParts.shortSymbol;
          const cachedAsset: Asset = this.cache.get(cacheKey);
          if (cachedAsset) {
            quotes.push(cachedAsset);
          } else {
            requestSymbols[cacheKey] = symbol;

            // group symbols by quote provider so we can do bulk requests
            let symbolsMap = providersSymbolsMap[quoteProvider.getId()];
            if (!symbolsMap) {
              symbolsMap = {
                provider: quoteProvider,
                symbols: {},
              };
              providersSymbolsMap[quoteProvider.getId()] = symbolsMap;
            }
            // store as map to avoid duplicates
            symbolsMap.symbols[symbol] = '1';
          }
        } else {
          // no appropriate quote provider found for asset
          quotes.push({
            price: null,
            symbol,
          });
        }
      }
    }

    const promises = [];
    for (const providerId of Object.keys(providersSymbolsMap)) {
      const symbolsMap = providersSymbolsMap[providerId];
      let promise;
      const providerSymbols = Object.keys(symbolsMap.symbols);
      if (assetType === AssetType.STOCK) {
        promise = symbolsMap.provider.getStockQuotes(providerSymbols);
      } else if (assetType === AssetType.CRYPTOCURRENCY) {
        promise = symbolsMap.provider.getCryptoCurrencyQuotes(providerSymbols);
      } else if (assetType === AssetType.BOND) {
        promise = symbolsMap.provider.getBondQuotes(providerSymbols);
      } else if (assetType === AssetType.COMMODITY) {
        promise = symbolsMap.provider.getCommodityQuotes(providerSymbols);
      } else if (assetType === AssetType.FOREX) {
        promise = symbolsMap.provider.getForexQuotes(providerSymbols);
      } else if (assetType === AssetType.MUTUAL_FUND) {
        promise = symbolsMap.provider.getMutualFundQuotes(providerSymbols);
      } else {
        throw new AssetTypeNotSupportedError(assetType);
      }

      promise.then((response) => {
        for (const asset of response) {
          this.fixAssetQuote(asset);
          // update cache
          const symbolParts = parseSymbol(asset.symbol);
          const cacheKey = symbolsMap.provider.getId() + '_' + symbolParts.shortSymbol;
          this.cache.set(cacheKey, asset, asset.price ? CONFIG.DEFAULT_CACHE_TTL : CONFIG.INVALIDASSET_CACHE_TTL);

          // replace processed symbol with user provided one
          asset.symbol = requestSymbols[cacheKey];
        }
        return response;
      });
      promises.push(promise);
    }
    if (promises.length > 0) {
      await Promise.all(promises).then((responses: Asset[][]) => {
        for (const response of responses) {
          quotes = quotes.concat(response);
        }
      });
    }
    return quotes;
  }

  /**
   * Handle quotes request
   * @param assetType the asset type to get quotes for
   * @param req request cointaining a list of asset symbols
   * @param res http response object that will return the quotes
   */
  private async handleRequest(assetType: AssetType, req: Request, res: Response) {
    if (req.body.symbols && req.body.symbols.length) {
      try {
        logger.debug(`HTTP Request: ${JSON.stringify(req.body)}`);
        const quotes = await this.getQuotes(req.body.symbols, assetType);
        logger.debug(`HTTP Response: ${JSON.stringify(quotes)}`);
        res.json(quotes);
      } catch (e) {
        if (e instanceof QuoteError) {
          res.status(500).json({ code: 500, message: e.message });
          logger.debug(e.stack);
        } else {
          res.status(500).json({ code: 500, message: 'Generic error' });
          logger.error(e.stack);
        }
      }
    } else {
      this.sendInvalidRequestResponse(res);
      logger.debug(`Invalid HTTP Request: ${JSON.stringify(req.body)}`);
    }
  }
}

quoteProviderService.registerQuoteProvider(coinbaseQuoteProvider);
quoteProviderService.registerQuoteProvider(binanceQuoteProvider);
quoteProviderService.registerQuoteProvider(iexQuoteProvider);
quoteProviderService.registerQuoteProvider(cmeQuoteProvider);
// quoteProviderService.registerQuoteProvider(xstuQuoteProvider);
quoteProviderService.registerQuoteProvider(xetrQuoteProvider);
quoteProviderService.registerQuoteProvider(bvbQuoteProvider);
quoteProviderService.registerQuoteProvider(xlonQuoteProvider);
quoteProviderService.registerQuoteProvider(morningstarQuoteProvider);
quoteProviderService.registerQuoteProvider(ftQuoteProvider);
quoteProviderService.registerQuoteProvider(yFinanceQuoteProvider);
