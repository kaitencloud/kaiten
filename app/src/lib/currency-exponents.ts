/**
 * How many decimals the minor unit of each currency has, as ISO 4217 gives them:
 * JPY 0, EUR 2, KWD 3, CLF 4. This is the table of the API
 * (`api/internal/infrastructure/billing/money/money.go`), which decides what
 * "an amount in minor units" means: 150000 of HUF is 1,500.00 where the API
 * counts two decimals. It is not read from the locale data of the browser, which
 * counts none for HUF, COP or IDR and would show such an amount a hundred times
 * too large. A unit test compares this table with the API's, code by code.
 */

// Codes are written in rows of a line each, and split once.
const codes = (...rows: string[]): string[] => rows.join(' ').split(' ');

const CODES_BY_EXPONENT: Readonly<Record<number, readonly string[]>> = {
  0: codes(
    'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX',
    'UYI VND VUV XAF XOF XPF',
  ),
  2: codes(
    'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM',
    'BBD BDT BGN BMD BND BOB BRL BSD BTN BWP BYN',
    'BZD CAD CDF CHF CNY COP CRC CUP CVE CZK DKK',
    'DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS',
    'GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR',
    'IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR',
    'LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR',
    'MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD',
    'PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR',
    'SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN',
    'SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS',
    'UAH USD UYU UZS VES WST XCD YER ZAR ZMW ZWG',
  ),
  3: codes('BHD IQD JOD KWD LYD OMR TND'),
  4: codes('CLF UYW'),
};

/** The decimals of the minor unit, by upper-case ISO 4217 code. */
export const CURRENCY_EXPONENTS: ReadonlyMap<string, number> = new Map(
  Object.entries(CODES_BY_EXPONENT).flatMap(([exponent, list]) =>
    list.map((code) => [code, Number(exponent)] as const),
  ),
);
