import app from "./app";
import https from "https";
import fs from "fs";
import logger from "./logger";
import { CONFIG } from "./config";




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