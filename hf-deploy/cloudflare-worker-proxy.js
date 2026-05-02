/**
 * Cloudflare Worker — Telegram Bot API Reverse Proxy
 *
 * يعمل هذا الـ Worker كـ proxy بين HuggingFace والـ Telegram API
 * لأن HuggingFace تستخدم AWS IPs المحجوبة من تيليغرام.
 *
 * طريقة النشر:
 * 1. سجّل حساب مجاني على https://cloudflare.com
 * 2. اذهب لـ Workers & Pages → Create Worker
 * 3. الصق هذا الكود واضغط Deploy
 * 4. انسخ رابط الـ Worker (مثل: https://my-tg-proxy.username.workers.dev)
 * 5. في HuggingFace Space Settings → Secrets → أضف:
 *    TELEGRAM_API_URL = https://my-tg-proxy.username.workers.dev
 *
 * الاستخدام المجاني: 100,000 طلب/يوم — أكثر من كافٍ للبوت
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Strip the worker path and forward to Telegram
    const telegramUrl = new URL("https://api.telegram.org" + url.pathname + url.search);

    const newRequest = new Request(telegramUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(newRequest);

      // Add CORS headers so the browser can also call it if needed
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      newHeaders.set("Access-Control-Allow-Headers", "Content-Type");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
