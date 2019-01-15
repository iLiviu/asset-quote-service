import app from "./app";
import https from "https";
import fs from "fs";
import logger from "./logger";
import { CONFIG } from "./config";


console.log(`AssetQuoteService Copyright (C) 2019  Liviu T Iancuta <liviu.iancuta@gmail.com>.
  This program comes with ABSOLUTELY NO WARRANTY. This program is free software:
  you can redistribute it and/or modify it under the terms of the GNU General 
  Public License as published by the Free Software Foundation, either version 3
  of the License, or (at your option) any later version.`);

const server = app.listen(app.get("port"), () => {
  logger.info(`HTTP Server is listening on port ${app.get("port")}!`);
});

if (CONFIG.SSL.ENABLE) {
  try {
    const options = {
      key: fs.readFileSync(CONFIG.SSL.PRIVATEKEY_PATH),
      cert: fs.readFileSync(CONFIG.SSL.CERT_PATH),
      ca: fs.readFileSync(CONFIG.SSL.CA_PATH),
    };

    const serverSSL = https.createServer(options, app).listen(app.get("httpsport"), () => {
      logger.info(`HTTPS Server is listening on port ${app.get("httpsport")}!`);
    });
  } catch (e) {
    logger.error(e.stack);
  }
}

export default server;