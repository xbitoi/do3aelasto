import { Router, type IRouter } from "express";
import fs from "fs";
import {
  startBot,
  stopBot,
  getBotStatus,
  testBotToken,
  getSettings,
  updateSettings,
  defaultSettings,
  getAvailableGeminiModels,
  checkGeminiKeyStatus,
  generateTTSPreview,
  testYouTubeToken,
  testFacebookToken,
  testTikTokToken,
  sendWelcomeToAll,
  getSchedulerStatus,
  getSmartBotStatus,
  triggerScheduledPost,
  sendManualReport,
  getAnalyticsSummary,
  fetchYouTubeAnalytics,
  fetchFacebookAnalytics,
  fetchTikTokAnalytics,
  fetchBotAnalytics,
} from "../lib/bot-manager.js";

const router: IRouter = Router();

router.post("/bot/start", async (req, res) => {
  const { geminiKey, botToken, groqKey } = req.body as { geminiKey: string; botToken: string; groqKey?: string };

  if (!geminiKey || !botToken) {
    res.status(400).json({ error: "مفتاح Gemini وتوكن البوت مطلوبان" });
    return;
  }

  const settings = getSettings();
  const result = await startBot(geminiKey, botToken, settings, groqKey || "");
  res.json(result);
});

router.post("/bot/stop", (_req, res) => {
  const result = stopBot();
  res.json(result);
});

router.get("/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

router.post("/bot/test", async (req, res) => {
  const { botToken } = req.body as { botToken: string };
  if (!botToken) {
    res.status(400).json({ error: "توكن البوت مطلوب" });
    return;
  }
  const result = await testBotToken(botToken);
  res.json(result);
});

router.get("/gemini-models", async (req, res) => {
  const geminiKey = req.query.geminiKey as string;
  if (!geminiKey) {
    res.status(400).json({ error: "geminiKey مطلوب" });
    return;
  }
  const models = await getAvailableGeminiModels(geminiKey);
  res.json({ models });
});

router.get("/gemini-status", async (req, res) => {
  const geminiKey = req.query.geminiKey as string;
  if (!geminiKey) {
    res.status(400).json({ error: "geminiKey مطلوب" });
    return;
  }
  const result = await checkGeminiKeyStatus(geminiKey);
  res.json(result);
});

router.get("/settings", (_req, res) => {
  res.json(getSettings());
});

router.put("/settings", (req, res) => {
  const updated = updateSettings(req.body);
  res.json(updated);
});

router.get("/tts-preview", async (req, res) => {
  const voice = (req.query.voice as string) || "ar-SA-HamedNeural";
  const slow = req.query.slow === "true";
  try {
    const audioPath = await generateTTSPreview(voice, slow);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    const stream = fs.createReadStream(audioPath);
    stream.pipe(res);
    stream.on("end", () => {
      try { fs.unlinkSync(audioPath); } catch {}
    });
    stream.on("error", () => {
      try { fs.unlinkSync(audioPath); } catch {}
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Social media key testing ──────────────────────────────────────────────

router.post("/social/test-youtube", async (req, res) => {
  const { token, clientId, clientSecret } = req.body as { token: string; clientId: string; clientSecret: string };
  if (!token || !clientId || !clientSecret) {
    res.status(400).json({ success: false, error: "Refresh Token و Client ID و Client Secret مطلوبة" });
    return;
  }
  const result = await testYouTubeToken(token, clientId, clientSecret);
  res.json(result);
});

router.post("/social/test-facebook", async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) {
    res.status(400).json({ success: false, error: "التوكن مطلوب" });
    return;
  }
  const result = await testFacebookToken(token);
  res.json(result);
});

router.post("/social/test-tiktok", async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) {
    res.status(400).json({ success: false, error: "التوكن مطلوب" });
    return;
  }
  const result = await testTikTokToken(token);
  res.json(result);
});

router.post("/bot/send-welcome", async (_req, res) => {
  const result = await sendWelcomeToAll();
  res.json(result);
});

// ── Analytics ─────────────────────────────────────────────────────────────

router.get("/analytics", (_req, res) => {
  const summary = getAnalyticsSummary();
  res.json(summary);
});

router.post("/analytics/report", async (req, res) => {
  const { chatId } = req.body as { chatId?: string };
  const settings = getSettings();
  const targetId = chatId
    ? parseInt(chatId)
    : settings.autoReportChatId
    ? parseInt(settings.autoReportChatId)
    : null;

  if (!targetId || isNaN(targetId)) {
    res.status(400).json({ success: false, error: "معرّف المحادثة مطلوب" });
    return;
  }
  try {
    const text = await sendManualReport(targetId);
    res.json({ success: true, reportText: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ── Scheduler ─────────────────────────────────────────────────────────────

router.get("/scheduler/status", (_req, res) => {
  res.json(getSchedulerStatus());
});

router.post("/scheduler/trigger", async (_req, res) => {
  try {
    await triggerScheduledPost();
    res.json({ success: true, message: "تم تشغيل المهمة المجدولة يدوياً" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ── Smart Bot ─────────────────────────────────────────────────────────────

router.get("/smart-bot/status", (_req, res) => {
  res.json(getSmartBotStatus());
});

// ── Platform Real Analytics ───────────────────────────────────────────────

router.get("/analytics/youtube", async (_req, res) => {
  const data = await fetchYouTubeAnalytics();
  res.json(data);
});

router.get("/analytics/facebook", async (_req, res) => {
  const data = await fetchFacebookAnalytics();
  res.json(data);
});

router.get("/analytics/tiktok", async (_req, res) => {
  const data = await fetchTikTokAnalytics();
  res.json(data);
});

router.get("/analytics/bot", (_req, res) => {
  res.json(fetchBotAnalytics());
});

export default router;
