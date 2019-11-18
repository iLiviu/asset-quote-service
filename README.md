# Asset Quote Service
Asset Quote Service gets the prices for a list of specified assets. It currently returns prices for stocks, bonds, mutual funds, cryptocurrencies and forex pairs.


## Supported exchanges
Below is a list of all implemented providers and the markets that they support

| Provider                  | Markets                 |
|---------------------------|:-----------------------:|
| Binance                   | Cryptocurrencies        |
| Boerse Frankfurt          | XETR Stocks, Intl Bonds |
| Boerse Stuttgart          | XSTU Stocks, Intl Bonds |
| Bursa de Valori Bucuresti | Romanian Stocks & Bonds |
| CME                       | Commodity futures       |
| Coinbase                  | Cryptocurrencies        |
| Financial Times           | Mutual Funds            |
| Fixer.io                  | Forex rates             |
| IEX                       | US Stocks               |
| London Stock Exchange     | XLON Stocks             |
| Morningstar               | Intl Stocks             |
| Yahoo Finance             | Intl Stocks             |


## Installation & Deployment

#### 1. Prerequirements
Make sure you have git and node.js installed. If you want to run inside a Docker container, you will also need to have Docker installed.

#### 2. Clone repository:
```
git clone https://github.com/iLiviu/asset-quote-service
cd asset-quote-service
```

### 3. Install dependencies:
```
npm install
```

### 4. Configuration:
Rename `src/config.ts.dist` file to `src/config.ts` then open the file with your favorite editor and:
* set `FIXER_API_KEY` to the correct api key you received when you signed up on [https://fixer.io/](https://fixer.io/). This is required in order to get forex rates.
* set `PRIVATEKEY_PATH`, `CERT_PATH`, `CA_PATH` to the path of your SSL certificate files. If you don't set these, the service will not be able to serve content over HTTPS
* the service caches the quotes for up to 1 hour by default. If you want to change the cache timeout or disable it, change the `DEFAULT_CACHE_TTL`

### 5. Build & Run:

```
npm run build
npm start
```


To run inside a docker container, use something like the following instead:
```
docker build -t asset-quote .
docker run -d -p 8080:8080 -p 8443:8443 --restart always asset-quote
```

## API
The service offers a REST API.  All requests and responses are `application/json` content type and follow typical HTTP response status codes for success and failure. If the service can't get the price for an asset, it will just not return it in the results, without throwing any error.

### Request data
The body of the request needs to be a json object with the `symbols` property set to an array containing the list of symbols. Example:
```
{"symbols": ["FB","TSLA","XETR:EUNL"]}
```

### Response data
A json array containing the list of quotes.
Example:
```
[
    {
        "price": 145.42,
        "symbol": "FB",
        "currency": "USD"
    },
    {
        "price": 334.46,
        "symbol": "TSLA",
        "currency": "USD"
    },
    {
        "currency": "EUR",
        "price": 44.791,
        "symbol": "XETR:EUNL"
    }
]
```

The following endpoints are available:


### Bonds
Get quotes for bonds. You need to provide the ISIN as symbol.
```
POST /bond
``` 

### Commodities
Get quotes for commodities. Currently supporting Aluminium(`AL`), Gold(`AU`), Platinum(`PT`), Silver(`AG`), Copper(`CU`), Palladium(`PD`), Corn(`ZC`), Soybean(`ZS`), Live Cattle(`LE`), Wheat(`ZW`), Crude Oil(`CL`), Brent Oil(`BZ`), Gasoline(`RB`), Natural Gas(`NG`)
```
POST /commodity
``` 

### Cryptocurrencies
Get quotes for cryptocurrencies. Symbol format is `<SYMBOL>` or `<EXCHANGE>:<SYMBOL>`, where EXCHANGE can be one of the following: `IEX`, `COINBASE` or `BINANCE`
```
POST /crypto
```

### Forex
Get forex rates. Format for a currency pair is <from_currency_code><to_currency_code>. Example: `EURUSD`
```
POST /forex
```

### Mutual Funds
Get quotes for mutual funds. You need to provide the ISIN as symbol.
```
POST /mutualfund
``` 

### Stocks
Get quotes for stocks. Symbol format is `<SYMBOL>` or `<MIC>:<SYMBOL>`, where MIC is the market identifier code for the exchange where the symbol is traded. Example: `XETR:EUNL`
```
POST /stock
```