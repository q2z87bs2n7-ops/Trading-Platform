// Maps FMP economic-calendar event names to FRED series pages. Rules were
// distilled from ~1 year of US High/Medium-impact releases; misses (Fed
// speeches, CFTC COT, ISM, OPEC, etc.) intentionally fall through to the
// existing Google-search fallback in EconomicCard.

export interface FredRule {
  // All keywords must appear in the event name (case-insensitive substring).
  // Order rules most-specific-first so e.g. "Core CPI" wins over "CPI".
  readonly keywords: readonly string[];
  readonly series: string;
  readonly label: string;
}

const FRED_BASE = "https://fred.stlouisfed.org/series/";

export const ECONOMIC_FRED_RULES: readonly FredRule[] = [
  // Inflation / prices
  { keywords: ["core inflation rate"], series: "CPILFESL", label: "Core CPI" },
  { keywords: ["core cpi"], series: "CPILFESL", label: "Core CPI" },
  { keywords: ["inflation rate"], series: "CPIAUCSL", label: "CPI" },
  { keywords: ["michigan 1 year inflation expectations"], series: "MICH", label: "Michigan 1Y Inflation Expectations" },
  { keywords: ["consumer inflation expectation"], series: "MICH", label: "Michigan 1Y Inflation Expectations" },
  { keywords: ["cpi s.a"], series: "CPIAUCSL", label: "CPI" },
  { keywords: ["cpi"], series: "CPIAUCSL", label: "CPI" },

  // PCE
  { keywords: ["core pce price index"], series: "PCEPILFE", label: "Core PCE Price Index" },
  { keywords: ["pce price index"], series: "PCEPI", label: "PCE Price Index" },
  { keywords: ["personal spending"], series: "PCE", label: "Personal Consumption Expenditures" },
  { keywords: ["personal income"], series: "PI", label: "Personal Income" },

  // PPI (core first)
  { keywords: ["core ppi"], series: "PPILFE", label: "Core PPI" },
  { keywords: ["producer price index"], series: "PPIFIS", label: "Producer Price Index" },
  { keywords: ["import prices"], series: "IR", label: "Import Price Index" },
  { keywords: ["export prices"], series: "IQ", label: "Export Price Index" },

  // Labor (claims/payrolls before generic unemployment so qualifiers win)
  { keywords: ["initial jobless claims"], series: "ICSA", label: "Initial Jobless Claims" },
  { keywords: ["continuing jobless claims"], series: "CCSA", label: "Continuing Jobless Claims" },
  { keywords: ["nonfarm payrolls private"], series: "USPRIV", label: "Nonfarm Private Payrolls" },
  { keywords: ["non farm payrolls"], series: "PAYEMS", label: "Nonfarm Payrolls" },
  { keywords: ["nonfarm payrolls"], series: "PAYEMS", label: "Nonfarm Payrolls" },
  { keywords: ["u-6 unemployment"], series: "U6RATE", label: "U-6 Unemployment Rate" },
  { keywords: ["unemployment rate"], series: "UNRATE", label: "Unemployment Rate" },
  { keywords: ["participation rate"], series: "CIVPART", label: "Labor Force Participation Rate" },
  { keywords: ["average hourly earnings"], series: "CES0500000003", label: "Average Hourly Earnings" },
  { keywords: ["adp employment change"], series: "NPPTTL", label: "ADP Nonfarm Employment Change" },
  { keywords: ["jolts job openings"], series: "JTSJOL", label: "JOLTS Job Openings" },
  { keywords: ["employment cost - wages"], series: "ECIWAG", label: "Employment Cost — Wages" },
  { keywords: ["employment cost - benefits"], series: "ECIBEN", label: "Employment Cost — Benefits" },
  { keywords: ["employment cost index"], series: "ECIALLCIV", label: "Employment Cost Index" },
  { keywords: ["nonfarm productivity"], series: "OPHNFB", label: "Nonfarm Business Productivity" },
  { keywords: ["unit labour costs"], series: "ULCNFB", label: "Unit Labor Costs" },
  { keywords: ["unit labor costs"], series: "ULCNFB", label: "Unit Labor Costs" },

  // Output / activity / GDP
  { keywords: ["gdp growth rate"], series: "A191RL1Q225SBEA", label: "Real GDP (QoQ, Annualized)" },
  { keywords: ["gross domestic product"], series: "GDPC1", label: "Real GDP" },
  { keywords: ["gdp price index"], series: "GDPDEF", label: "GDP Price Deflator" },
  { keywords: ["industrial production"], series: "INDPRO", label: "Industrial Production Index" },
  { keywords: ["corporate profits"], series: "CP", label: "Corporate Profits" },
  { keywords: ["chicago fed national activity index"], series: "CFNAI", label: "Chicago Fed National Activity Index" },
  { keywords: ["leading index"], series: "USSLIND", label: "Leading Index for the United States" },

  // Housing
  { keywords: ["building permits"], series: "PERMIT", label: "Building Permits" },
  { keywords: ["housing starts"], series: "HOUST", label: "Housing Starts" },
  { keywords: ["new home sales"], series: "HSN1F", label: "New One-Family Houses Sold" },
  { keywords: ["existing home sales"], series: "EXHOSLUSM495S", label: "Existing Home Sales" },
  { keywords: ["s&p/case-shiller home price"], series: "CSUSHPINSA", label: "Case-Shiller US National Home Price Index" },
  { keywords: ["mba 30-year mortgage rate"], series: "MORTGAGE30US", label: "30-Year Fixed Mortgage Rate" },
  { keywords: ["construction spending"], series: "TTLCONS", label: "Total Construction Spending" },

  // Surveys / sentiment
  { keywords: ["michigan consumer sentiment"], series: "UMCSENT", label: "Michigan Consumer Sentiment" },
  { keywords: ["michigan consumer expectations"], series: "UMCSENT", label: "Michigan Consumer Sentiment" },
  { keywords: ["cb consumer confidence"], series: "CSCICP03USM665S", label: "OECD US Consumer Confidence Indicator" },
  { keywords: ["philadelphia fed manufacturing"], series: "GACDFSA066MSFRBPHI", label: "Philly Fed Mfg Business Outlook" },
  { keywords: ["ny empire state manufacturing"], series: "GACDISA066MSFRBNY", label: "Empire State Mfg Survey" },
  { keywords: ["dallas fed manufacturing"], series: "BACTSAMFRBDAL", label: "Dallas Fed Mfg Outlook" },

  // Retail / consumer
  { keywords: ["retail sales ex autos"], series: "RSFSXMV", label: "Retail Sales ex Autos" },
  { keywords: ["retail sales"], series: "RSAFS", label: "Advance Retail Sales" },
  { keywords: ["consumer credit change"], series: "TOTALSL", label: "Total Consumer Credit" },

  // Orders / inventories
  { keywords: ["durable goods orders ex transp"], series: "ADXTNO", label: "Durable Goods ex Transportation" },
  { keywords: ["durable goods orders"], series: "DGORDER", label: "Durable Goods Orders" },
  { keywords: ["factory orders"], series: "AMTMNO", label: "Manufacturers' New Orders" },
  { keywords: ["business inventories"], series: "BUSINV", label: "Total Business Inventories" },
  { keywords: ["wholesale inventories"], series: "WHLSLRIMSA", label: "Wholesale Inventories" },
  { keywords: ["retail inventories"], series: "RETAILIMSA", label: "Retail Inventories" },

  // Trade (goods-only before goods+services so the qualifier wins)
  { keywords: ["goods trade balance"], series: "BOPGTB", label: "Goods Trade Balance" },
  { keywords: ["balance of trade"], series: "BOPGSTB", label: "Trade Balance: Goods & Services" },
  { keywords: ["imports"], series: "IMPGS", label: "Imports of Goods & Services" },
  { keywords: ["exports"], series: "EXPGS", label: "Exports of Goods & Services" },
  { keywords: ["current account"], series: "IEABC", label: "Current Account Balance" },

  // Fed / monetary policy — funds rate is the universally useful chart
  { keywords: ["fed interest rate decision"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },
  { keywords: ["fomc minutes"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },
  { keywords: ["fomc economic projections"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },
  { keywords: ["beige book"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },
  { keywords: ["fed chair powell"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },
  { keywords: ["fed press conference"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },
  { keywords: ["monetary policy report"], series: "FEDFUNDS", label: "Federal Funds Effective Rate" },

  // Government / fiscal
  { keywords: ["monthly budget statement"], series: "MTSDS133FMS", label: "Federal Surplus or Deficit" },
  { keywords: ["budget balance"], series: "MTSDS133FMS", label: "Federal Surplus or Deficit" },
  { keywords: ["federal budget"], series: "MTSDS133FMS", label: "Federal Surplus or Deficit" },

  // Energy (EIA weekly)
  { keywords: ["eia crude oil stocks change"], series: "WCESTUS1", label: "Weekly Ending Stocks of Crude Oil" },
  { keywords: ["eia gasoline stocks change"], series: "WGFSTUS1", label: "Weekly Ending Stocks of Gasoline" },

  // Treasury auctions — chart the corresponding constant-maturity yield
  { keywords: ["10-year note auction"], series: "DGS10", label: "10-Year Treasury Yield" },
  { keywords: ["20-year bond auction"], series: "DGS20", label: "20-Year Treasury Yield" },
  { keywords: ["30-year bond auction"], series: "DGS30", label: "30-Year Treasury Yield" },
  { keywords: ["30-year tips auction"], series: "DFII30", label: "30-Year TIPS Yield" },
  { keywords: ["7-year note auction"], series: "DGS7", label: "7-Year Treasury Yield" },
  { keywords: ["5-year note auction"], series: "DGS5", label: "5-Year Treasury Yield" },
  { keywords: ["3-year note auction"], series: "DGS3", label: "3-Year Treasury Yield" },
  { keywords: ["2-year note auction"], series: "DGS2", label: "2-Year Treasury Yield" },
];

export function lookupFredUrl(event: string | null | undefined): string | null {
  if (!event) return null;
  const low = event.toLowerCase();
  for (const rule of ECONOMIC_FRED_RULES) {
    if (rule.keywords.every((k) => low.includes(k))) {
      return FRED_BASE + rule.series;
    }
  }
  return null;
}
