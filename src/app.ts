import express from 'express';
import compression from "compression";  // compresses requests
import bodyParser from "body-parser";
import expressValidator from "express-validator";
import logger from './logger';

import { AssetQuoteRequestHandler } from './controllers/asset-quote-request-handler';
import { CONFIG } from './config';



const app = express();

let quoteHandler = new AssetQuoteRequestHandler();
var allowCrossDomain = function(req:any, res:any, next:any) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
}
// Express configuration
app.set("port", process.env.PORT || CONFIG.DEFAULT_HTTP_PORT);
app.set("httpsport", process.env.HTTPSPORT || CONFIG.DEFAULT_HTTPS_PORT);
app.use(compression());
app.use(bodyParser.json());
app.use(expressValidator());
app.use(allowCrossDomain);

//routes
app.get('/', function (req, res) {
   res.send('Hello there');
});
app.post('/stock', quoteHandler.stockRequest);
app.post('/crypto', quoteHandler.cryptocurrencyRequest);
app.post('/commodity', quoteHandler.commodityRequest);
app.post('/bond', quoteHandler.bondRequest);
app.post('/forex', quoteHandler.forexRequest);

app.use(function(err:any, req:any, res:any, next:any) {
  // error handling logic
  res.status(500).json({code:500, message:'Generic error'});
  logger.error(err.stack)
});

export default app;