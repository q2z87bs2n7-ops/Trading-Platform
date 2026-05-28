// Map FXCM instruments → ISO 3166-1 alpha-2 country codes for the
// economic-calendar filter. Derived from the full FXCM product list, not just
// our current watchlist — adding a pair / index / CFD in the bridge updates
// the calendar automatically.
//
// Three symbol shapes to handle:
//   1. Slash-form pair (fiat/fiat or metal/fiat): EUR/USD → EU+DE+FR+... + US
//   2. Stock CFD with .cc suffix: RBLX.us → US, BIDU.hk → HK
//   3. Index / commodity name with country prefix: US30 → US, UK100 → GB
//
// Anything we can't map returns []. FMP's economic feed uses ISO codes for
// individual countries plus "EU" for the eurozone aggregate, so EUR expands
// to both "EU" and the major eurozone economies that publish their own
// indicators.

const CURRENCY_TO_COUNTRIES: Record<string, readonly string[]> = {
  USD: ["US"],
  EUR: ["EU", "DE", "FR", "IT", "ES", "NL", "BE", "IE", "AT", "FI", "PT", "GR"],
  GBP: ["GB"],
  JPY: ["JP"],
  CHF: ["CH"],
  AUD: ["AU"],
  CAD: ["CA"],
  NZD: ["NZ"],
  SEK: ["SE"],
  NOK: ["NO"],
  DKK: ["DK"],
  MXN: ["MX"],
  ZAR: ["ZA"],
  HKD: ["HK"],
  SGD: ["SG"],
  TRY: ["TR"],
  CNH: ["CN"],
  PLN: ["PL"],
  HUF: ["HU"],
  CZK: ["CZ"],
  ILS: ["IL"],
  // Metals — global commodities. No country binding; events that move them
  // (gold/silver fixings, etc.) are covered by the quote currency's country.
  XAU: [],
  XAG: [],
  XPT: [],
  XPD: [],
};

// FXCM stock CFDs use a 2-letter exchange suffix.
const SUFFIX_TO_COUNTRY: Record<string, string> = {
  us: "US",
  ca: "CA",
  de: "DE",
  fr: "FR",
  it: "IT",
  es: "ES",
  uk: "GB",
  hk: "HK",
  jp: "JP",
  au: "AU",
  nl: "NL",
  ch: "CH",
};

// Best-effort country detection from index / commodity names. Longest prefix
// wins so "NETH" beats "NE", and "JPN" beats "JP".
const INDEX_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["NETH", "NL"], // NETH25
  ["GER",  "DE"], // GER30, GER40
  ["FRA",  "FR"], // FRA40
  ["JPN",  "JP"], // JPN225
  ["AUS",  "AU"], // AUS200
  ["HKG",  "HK"], // HKG33
  ["ESP",  "ES"], // ESP35
  ["SUI",  "CH"], // SUI20
  ["CHN",  "CN"], // CHN50
  ["NAS",  "US"], // NAS100
  ["SPX",  "US"], // SPX500
  ["US",   "US"], // US30, US500, US2000, USDOLLAR
  ["UK",   "GB"], // UK100, UKOIL
];

const PAIR_RE = /^([A-Z]{3})\/([A-Z]{3})$/;
const CFD_SUFFIX_RE = /\.([a-z]{2})$/;

export function fxcmInstrumentToCountries(symbol: string): readonly string[] {
  if (!symbol) return [];

  const pair = PAIR_RE.exec(symbol);
  if (pair) {
    const base = CURRENCY_TO_COUNTRIES[pair[1]] ?? [];
    const quote = CURRENCY_TO_COUNTRIES[pair[2]] ?? [];
    return [...base, ...quote];
  }

  const cfd = CFD_SUFFIX_RE.exec(symbol);
  if (cfd) {
    const c = SUFFIX_TO_COUNTRY[cfd[1]];
    return c ? [c] : [];
  }

  for (const [prefix, country] of INDEX_PREFIXES) {
    if (symbol.startsWith(prefix)) return [country];
  }

  return [];
}

export function fxcmCountrySet(instruments: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const inst of instruments) {
    for (const cc of fxcmInstrumentToCountries(inst)) set.add(cc);
  }
  return Array.from(set).sort();
}
