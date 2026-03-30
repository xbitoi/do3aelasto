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
  generateTTSPreview,
  testYouTubeToken,
  testFacebookToken,
  testTikTokToken,
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
  const { token } = req.body as { token: string };
  if (!token) {
    res.status(400).json({ success: false, error: "التوكن مطلوب" });
    return;
  }
  const result = await testYouTubeToken(token);
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

export default router;
