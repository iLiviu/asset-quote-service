import bodyParser from 'body-parser';
import compression from 'compression';
import express from 'express';
import expressValidator from 'express-validator';

import { CONFIG } from './config';
import { AssetQuoteRequestHandler } from './controllers/asset-quote-request-handler';
import logger from './logger';

const app = express();

const quoteHandler = new AssetQuoteRequestHandler();
const allowCrossDomain = (req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST');
  if (req.headers['access-control-request-headers']) {
    res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
  }
  next();
};
// Express configuration
app.set('port', process.env.PORT || CONFIG.DEFAULT_HTTP_PORT);
app.set('httpsport', process.env.HTTPSPORT || CONFIG.DEFAULT_HTTPS_PORT);
app.use(compression());
app.use(bodyParser.json());
app.use(expressValidator());
app.use(allowCrossDomain);

// routes
app.get('/', (req, res) => {
  res.send('Hello there');
});
app.post('/stock', quoteHandler.stockRequest);
app.post('/crypto', quoteHandler.cryptocurrencyRequest);
app.post('/commodity', quoteHandler.commodityRequest);
app.post('/bond', quoteHandler.bondRequest);
app.post('/forex', quoteHandler.forexRequest);
app.post('/mutualfund', quoteHandler.mutualFundRequest);

app.use((err: any, req: any, res: any, next: any) => {
  // error handling logic
  res.status(500).json({ code: 500, message: 'Generic error' });
  logger.error(err.stack);
});

export default app;
