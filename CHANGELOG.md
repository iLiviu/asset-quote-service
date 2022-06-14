## Master
## Improvements
* Increase Fixer cache TTL to avoid hitting new API limit
### Bug fixes
* Fix getting a cached quote when exchange identifier is different
* Switch from discontinued IEX API to IEX Cloud API
* fix getting quotes for XBSE/AERO

## 1.2.2 (2021-04-12)
### Features
* Get quotes for funds listed on XBSE
### Bug fixes
* Get quotes for non USDT pairs on Binance and for GBP pairs on Coinbase


## 1.2.1 (2020-08-04)
### Bug fixes
* fix getting quotes for XBSE

## 1.2.0 (2020-02-26)

### Features
* get international stock quotes using Yahoo Finance

### Bug fixes
* Provide XLON GBP quotes in pounds instead of pence
* Allow 1 character symbols

## 1.1.4 (2019-11-04)
* updated dependencies

### Features
* cache info for XETR searches
* cache internal symbols for XLON ISIN searches

### Bug fixes
* fix getting quotes from Morningstar
* fix getting quotes for bonds on BVB AeRO

## 1.1.3 (2019-07-03)
* updated dependencies
### Bug fixes
* fix getting quotes from XETR

## 1.1.2 (2019-06-29)
### Bug fixes
* fix getting quotes from XETR

## 1.1.1 (2019-03-18)

### Bug fixes
* fix getting quotes from Morningstar when ISIN is provided
* fail silently on individual quote exceptions
* get bond quotes
* fix getting quotes from BVB

## 1.1.0 (2019-01-28)

### Features
* add support for mutual funds


## 1.0.0 (2019-01-15)

Initial public release
