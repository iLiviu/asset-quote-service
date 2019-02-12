import { Dictionary } from '../models/dictionary';

export class Asset {
  symbol: string;
  price: number;
  currency?: string;
  percentPrice?: boolean;
}

export enum AssetType {
  STOCK,
  BOND,
  COMMODITY,
  CRYPTOCURRENCY,
  FOREX,
  MUTUAL_FUND,
}

export interface SymbolParts {
  marketCode: string;
  shortSymbol: string;

}

export class QuoteError extends Error {
  constructor(message?: string) {
    super(message);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, QuoteError.prototype);
  }
}

export class AssetTypeNotSupportedError extends QuoteError {
  private _assetType: AssetType;
  constructor(assetType: AssetType) {
    super('Asset type not supported: ' + assetType);
    this._assetType = assetType;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, AssetTypeNotSupportedError.prototype);
  }

  get assetType() {
    return this._assetType;
  }
}

export class SymbolNotSupportedError extends QuoteError {
  private _symbol: string;
  constructor(symbol: string) {
    super('Symbol not supported: ' + symbol);
    this._symbol = symbol;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, SymbolNotSupportedError.prototype);
  }

  get symbol() {
    return this._symbol;
  }
}

export class SymbolQuoteError extends QuoteError {
  private _symbol: string;
  constructor(symbol: string) {
    super('Could not get quote for symbol: ' + symbol);
    this._symbol = symbol;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, SymbolQuoteError.prototype);
  }

  get symbol() {
    return this._symbol;
  }
}

export interface QuoteProvider {
  getStockQuotes(symbols: string[]): Promise<Asset[]>;
  getBondQuotes(symbols: string[]): Promise<Asset[]>;
  getCommodityQuotes(symbols: string[]): Promise<Asset[]>;
  getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]>;
  getForexQuotes(symbols: string[]): Promise<Asset[]>;
  getMutualFundQuotes(symbols: string[]): Promise<Asset[]>;
  getSupportedMarkets(): string[];
  getId(): string;
}

class QuoteProviderService {
  registeredQuoteProviders: QuoteProvider[] = [];
  supportedMarkets: Dictionary<QuoteProvider> = {};

  /**
   * Registers the supported markets of a given QuoteProvider
   * @param provider QuoteProvider instance to register
   */
  registerQuoteProvider(provider: QuoteProvider) {
    if (this.registeredQuoteProviders.findIndex((item) => item.getId() === provider.getId()) < 0) {
      this.registeredQuoteProviders.push(provider);
      const markets = provider.getSupportedMarkets();
      for (const market of markets) {
        this.supportedMarkets[market] = provider;
      }
    }
  }

  /**
   * Returns a quote provider for a given market id
   * @param market market id
   * @return appropriate QuoteProvider for market, or null if market is not supported
   */
  getQuoteProvider(market: string): QuoteProvider {
    return this.supportedMarkets[market];
  }
}

export function parseSymbol(fullSymbol: string): SymbolParts {
  const symbolParts = fullSymbol.split(':');
  const marketId: string = (symbolParts.length > 1) ? symbolParts[0] : '';
  const shortSymbol: string = (symbolParts.length > 1) ? symbolParts[1] : fullSymbol;
  return {
    marketCode: marketId,
    shortSymbol,
  };
}

export function getShortSymbols(fullSymbols: string[]): string[] {
  const result: string[] = [];
  for (const fullSymbol of fullSymbols) {
    const symbolParts = parseSymbol(fullSymbol);
    result.push(symbolParts.shortSymbol);
  }
  return result;
}

export function mapStringKeyValues(keys: string[], values: string[]): Dictionary<string> {
  const result: Dictionary<string> = {};
  if (keys.length !== values.length) {
    throw new Error('Array lengths do not match');
  }
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = values[i];
  }
  return result;
}

export function isValidISIN(symbol: string): boolean {
  return symbol.match(/[a-z0-9]{12,12}/i) !== null;
}

export function isValidMIC(marketID: string): boolean {
  return marketID.match(/[A-Z]{4,4}/i) !== null;
}

export const quoteProviderService = new QuoteProviderService();
