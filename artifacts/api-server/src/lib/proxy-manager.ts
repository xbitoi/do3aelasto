import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { logger } from "./logger.js";

export type ConnectionType = "proxy" | "direct" | "none";

export interface ProxyStatus {
  type: ConnectionType;
  proxyUrl?: string;
  checked: boolean;
  checking: boolean;
  error?: string;
  checkedAt?: number;
}

let status: ProxyStatus = { type: "direct", checked: false, checking: false };

function detectProxyFromEnv(): string | undefined {
  return (
    process.env["HTTPS_PROXY"] ||
    process.env["HTTP_PROXY"] ||
    process.env["https_proxy"] ||
    process.env["http_proxy"] ||
    process.env["ALL_PROXY"] ||
    process.env["all_proxy"] ||
    process.env["SOCKS_PROXY"] ||
    process.env["SOCKS5_PROXY"]
  );
}

export async function initProxy(): Promise<ProxyStatus> {
  const proxyUrl = detectProxyFromEnv();

  try {
    // EnvHttpProxyAgent automatically reads HTTPS_PROXY / HTTP_PROXY / NO_PROXY from env
    const agent = new EnvHttpProxyAgent();
    setGlobalDispatcher(agent);

    if (proxyUrl) {
      status = { type: "proxy", proxyUrl, checked: true, checking: false, checkedAt: Date.now() };
      logger.info({ proxyUrl }, "Proxy configured via env — EnvHttpProxyAgent active");
    } else {
      status = { type: "direct", checked: true, checking: false, checkedAt: Date.now() };
      logger.info("No proxy in env — direct connection via EnvHttpProxyAgent");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to set EnvHttpProxyAgent, using default dispatcher");
    status = { type: proxyUrl ? "proxy" : "direct", proxyUrl, checked: true, checking: false, checkedAt: Date.now() };
  }

  return status;
}

export async function recheckProxy(): Promise<ProxyStatus> {
  return initProxy();
}

export function getProxyStatus(): ProxyStatus {
  return status;
}

export function getProxyUrl(): string | undefined {
  return detectProxyFromEnv();
}
