import { ProxyAgent, setGlobalDispatcher, Agent } from "undici";
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

const TEST_URL = "https://api.telegram.org";
const TIMEOUT_MS = 6000;

async function testConnectivity(proxyUrl?: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const opts: Record<string, unknown> = { signal: controller.signal, method: "HEAD" };
    if (proxyUrl) {
      (opts as any).dispatcher = new ProxyAgent(proxyUrl);
    }
    const res = await fetch(TEST_URL, opts as RequestInit);
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function initProxy(): Promise<ProxyStatus> {
  if (status.checking) return status;
  status = { ...status, checking: true };

  const proxyUrl =
    process.env["HTTPS_PROXY"] ||
    process.env["HTTP_PROXY"] ||
    process.env["https_proxy"] ||
    process.env["http_proxy"] ||
    process.env["ALL_PROXY"] ||
    process.env["all_proxy"] ||
    process.env["SOCKS_PROXY"] ||
    process.env["SOCKS5_PROXY"];

  if (proxyUrl) {
    logger.info({ proxyUrl }, "Proxy configured — testing…");
    const proxyWorks = await testConnectivity(proxyUrl);
    if (proxyWorks) {
      try {
        const agent = new ProxyAgent(proxyUrl);
        setGlobalDispatcher(agent);
        status = { type: "proxy", proxyUrl, checked: true, checking: false, checkedAt: Date.now() };
        logger.info({ proxyUrl }, "Proxy works — using it for all connections");
        return status;
      } catch (err) {
        logger.warn({ err }, "Failed to set global proxy dispatcher");
      }
    } else {
      logger.warn({ proxyUrl }, "Proxy configured but unreachable — trying direct");
    }
  }

  const directWorks = await testConnectivity();
  if (directWorks) {
    setGlobalDispatcher(new Agent());
    status = { type: "direct", checked: true, checking: false, checkedAt: Date.now() };
    logger.info("Direct internet access confirmed");
  } else {
    status = { type: "none", checked: true, checking: false, error: "لا يوجد اتصال بالإنترنت", checkedAt: Date.now() };
    logger.warn("No internet access detected (proxy or direct)");
  }

  return status;
}

export async function recheckProxy(): Promise<ProxyStatus> {
  status = { type: "direct", checked: false, checking: false };
  return initProxy();
}

export function getProxyStatus(): ProxyStatus {
  return status;
}

export function getProxyUrl(): string | undefined {
  return status.type === "proxy" ? status.proxyUrl : undefined;
}
