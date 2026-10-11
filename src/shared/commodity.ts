import { Dictionary } from "../models/dictionary";

export interface CommoditySymbol {
  code: number;
  symbol: string;
}

// numeric codes used by CME for commodities
export const COMMODITY_CODES: Dictionary<CommoditySymbol> = {
  // metals
  AU: { code: 437, symbol: 'GC' },
  GC: { code: 437, symbol: 'GC' },
  GOLD: { code: 437, symbol: 'GC' },
  PLATINUM: { code: 446, symbol: 'PL' },
  PT: { code: 446, symbol: 'PL' },
  PL: { code: 446, symbol: 'PL' },
  ALUMINIUM: { code: 7440, symbol: 'ALI' },
  AL: { code: 7440, symbol: 'ALI' },
  ALI: { code: 7440, symbol: 'ALI' },
  SILVER: { code: 458, symbol: 'SI' },
  AG: { code: 458, symbol: 'SI' },
  SI: { code: 458, symbol: 'SI' },
  COPPER: { code: 438, symbol: 'HG' },
  CU: { code: 438, symbol: 'HG' },
  HG: { code: 438, symbol: 'HG' },
  PALLADIUM: { code: 445, symbol: 'PA' },
  PD: { code: 445, symbol: 'PA' },
  PA: { code: 445, symbol: 'PA' },

  // agricultural
  CORN: { code: 300, symbol: 'ZC' },
  ZC: { code: 300, symbol: 'ZC' },
  SOYBEAN: { code: 320, symbol: 'ZS' },
  ZS: { code: 320, symbol: 'ZS' },
  LE: { code: 22, symbol: 'LE' }, // live cattle
  ZW: { code: 323, symbol: 'ZW' }, // wheat

  // energy
  OIL: { code: 425, symbol: 'CL' }, // crude oil
  CL: { code: 425, symbol: 'CL' },
  BZ: { code: 424, symbol: 'BZ' }, // brent oil
  RB: { code: 429, symbol: 'RB' }, // gasoline
  NG: { code: 444, symbol: 'NG' }, // natural gas
};