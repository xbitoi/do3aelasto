import app from "./app";
import { logger } from "./lib/logger";
import { tryAutoStartBot } from "./lib/bot-manager.js";
import { initProxy } from "./lib/proxy-manager.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  initProxy().then((proxyStatus) => {
    logger.info({ connectionType: proxyStatus.type, proxy: proxyStatus.proxyUrl }, "Connection type determined");
    return tryAutoStartBot();
  }).then((result) => {
    logger.info({ result }, "Auto-start bot result");
  }).catch((err) => {
    logger.warn({ err }, "Startup sequence failed");
  });
});
