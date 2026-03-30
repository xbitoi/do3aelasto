import { Router, type IRouter } from "express";
import {
  startBot,
  stopBot,
  getBotStatus,
  testBotToken,
  getSettings,
  updateSettings,
  defaultSettings,
  getAvailableGeminiModels,
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

export default router;
