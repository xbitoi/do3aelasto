import TelegramBot from "node-telegram-bot-api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger.js";
import { getProxyUrl } from "./proxy-manager.js";
import { recordPublish, getAnalyticsSummary, buildWeeklyReportText, saveChannelStats, loadChannelStats, type ChannelStat } from "./analytics.js";

const execAsync = promisify(exec);

export type LogLevel = "info" | "success" | "error" | "warning" | "processing";

export interface LogEntry {
  id: string;
  message: string;
  level: LogLevel;
  time: string;
}

export interface AppSettings {
  font: string;
  fontSize: number;
  yPosition: number;
  lineHeight: number;
  strokeThickness: number;
  textColor: string;
  activeColor: string;
  ttsSpeed: boolean;
  ttsVoice: string;
  duaaStyle: string;
  videoQuality: string;
  bgOpacity: number;
  bgColor: string;
  bgColorMode: string;
  showBackground: boolean;
  shadowColor: string;
  shadowColorMode: string;
  geminiModel: string;
  originalVolume: number;
  duaaVolume: number;
  muteOriginal: boolean;
  muteDuaa: boolean;
  wordEffect: string;
  transitionEffect: string;
  transitionDuration: number;
  // Social media publishing
  youtubeToken: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
  facebookToken: string;
  tiktokToken: string;
  publishDescription: string;
  // Aspect ratio
  aspectRatio: string;
  // Scheduled posting
  scheduledFbPostEnabled: boolean;
  scheduledFbPostTime: string;
  scheduledFbPostDays: string;
  scheduledDuaaStyle: string;
  // YouTube captions
  youtubeAutoCaption: boolean;
  captionTranslateLang: string;
  // Analytics & reports
  autoReportEnabled: boolean;
  autoReportChatId: string;
  weeklyReportDay: number;
  // Smart bot
  smartBotEnabled: boolean;
  managedChannelIds: string;
  smartBotAdminChatId: string;
}

export const defaultSettings: AppSettings = {
  font: "BeIn",
  fontSize: 60,
  yPosition: 80,
  lineHeight: 1.4,
  strokeThickness: 3,
  textColor: "#FFFFFF",
  activeColor: "#3B82F6",
  ttsSpeed: false,
  ttsVoice: "ar-SA-HamedNeural",
  duaaStyle: "تضرع وخشوع",
  videoQuality: "fast",
  bgOpacity: 40,
  bgColor: "#3B82F6",
  bgColorMode: "fixed",
  showBackground: true,
  shadowColor: "#000000",
  shadowColorMode: "fixed",
  geminiModel: "auto",
  originalVolume: 90,
  duaaVolume: 120,
  muteOriginal: false,
  muteDuaa: false,
  wordEffect: "random",
  transitionEffect: "random",
  transitionDuration: 0.5,
  youtubeToken: "",
  youtubeClientId: "",
  youtubeClientSecret: "",
  facebookToken: "",
  tiktokToken: "",
  publishDescription: "",
  aspectRatio: "9:16",
  scheduledFbPostEnabled: false,
  scheduledFbPostTime: "08:00",
  scheduledFbPostDays: "all",
  scheduledDuaaStyle: "عشوائي",
  youtubeAutoCaption: false,
  captionTranslateLang: "en",
  autoReportEnabled: false,
  autoReportChatId: "",
  weeklyReportDay: 5,
  smartBotEnabled: false,
  managedChannelIds: "",
  smartBotAdminChatId: "",
};

interface ChatSession {
  state: "collecting";
  videos: Array<{ num: number; fileId: string }>;
  tmpDir: string;
}

let botInstance: TelegramBot | null = null;
let botRunning = false;
let botName = "";
let botUsername = "";
let processedCount = 0;
let startTime: number | null = null;
let geminiKeyStore = "";
let groqKeyStore = "";
let logs: LogEntry[] = [];
const chatSessions = new Map<number, ChatSession>();

// ── Pending video choice (waiting for user to pick 1 or 2) ───────────────
const pendingVideoChoices = new Map<number, TelegramBot.Message>();

// ── Last published video (for "نشر" command) ──────────────────────────────
const LAST_VIDEO_FILE = path.join(process.cwd(), "last-video.json");
const LAST_VIDEO_PATH = path.join(process.cwd(), "last-video.mp4");

interface LastVideoInfo {
  duaaText: string;
  timestamp: number;
}

function saveLastVideo(videoPath: string, duaaText: string) {
  try {
    fs.copyFileSync(videoPath, LAST_VIDEO_PATH);
    const info: LastVideoInfo = { duaaText, timestamp: Date.now() };
    fs.writeFileSync(LAST_VIDEO_FILE, JSON.stringify(info, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to save last video");
  }
}

function loadLastVideo(): (LastVideoInfo & { videoPath: string }) | null {
  try {
    if (fs.existsSync(LAST_VIDEO_FILE) && fs.existsSync(LAST_VIDEO_PATH)) {
      const info: LastVideoInfo = JSON.parse(fs.readFileSync(LAST_VIDEO_FILE, "utf8"));
      return { ...info, videoPath: LAST_VIDEO_PATH };
    }
  } catch {}
  return null;
}

// ── Active operations & cancellation ──────────────────────────────────────
interface ActiveOp {
  chatId: number;
  type: "single" | "multi";
  stage: string;
  startedAt: number;
}
const activeOps = new Map<number, ActiveOp>();
const cancelledChats = new Set<number>();

export function getActiveOps() {
  return [...activeOps.values()];
}

export function cancelAllOps() {
  const count = activeOps.size;
  for (const id of activeOps.keys()) cancelledChats.add(id);
  return count;
}

function setOpStage(chatId: number, stage: string) {
  const op = activeOps.get(chatId);
  if (op) op.stage = stage;
}

function checkCancelled(chatId: number) {
  if (cancelledChats.has(chatId)) {
    cancelledChats.delete(chatId);
    throw new Error("CANCELLED");
  }
}

// ── Known chats (for restart welcome) ─────────────────────────────────────
const knownChatIds = new Set<number>();
const KNOWN_CHATS_FILE = path.join(process.cwd(), "known-chats.json");

function loadKnownChats() {
  try {
    if (fs.existsSync(KNOWN_CHATS_FILE)) {
      const ids: number[] = JSON.parse(fs.readFileSync(KNOWN_CHATS_FILE, "utf8"));
      ids.forEach(id => knownChatIds.add(id));
    }
  } catch {}
}

function saveKnownChats() {
  try {
    fs.writeFileSync(KNOWN_CHATS_FILE, JSON.stringify([...knownChatIds], null, 2), "utf8");
  } catch {}
}

function trackChat(chatId: number) {
  if (!knownChatIds.has(chatId)) {
    knownChatIds.add(chatId);
    saveKnownChats();
  }
}

// ── Credentials persistence (for auto-restart) ─────────────────────────────
const CREDS_FILE = path.join(process.cwd(), "bot-creds.json");

export function saveCredentials(botToken: string, geminiKey: string, groqKey: string) {
  try {
    fs.writeFileSync(CREDS_FILE, JSON.stringify({ botToken, geminiKey, groqKey }, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to save bot credentials");
  }
}

export function loadCredentials(): { botToken: string; geminiKey: string; groqKey: string } | null {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
    }
  } catch {}
  return null;
}

loadKnownChats();

// ── Scheduler state ────────────────────────────────────────────────────────
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastScheduledPostDate = "";
let lastWeeklyReportDate = "";

export function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    lastScheduledPostDate,
    lastWeeklyReportDate,
  };
}

// ── Smart Bot channel management ───────────────────────────────────────────
let smartBotInterval: ReturnType<typeof setInterval> | null = null;
let lastChannelCheckTime = 0;

export function getSmartBotStatus() {
  return {
    running: smartBotInterval !== null,
    lastChannelCheckTime,
    channelStats: loadChannelStats(),
  };
}

// ── SRT generation from word timings ──────────────────────────────────────
function generateSRT(
  words: string[],
  wordTimings: number[],
  totalDuration: number
): string {
  const lines: string[] = [];
  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  const groupSize = 5;
  for (let i = 0; i < words.length; i += groupSize) {
    const chunk = words.slice(i, i + groupSize);
    const startTime = wordTimings[i] || 0;
    const endIdx = Math.min(i + groupSize, words.length - 1);
    const endTime = i + groupSize < words.length
      ? (wordTimings[i + groupSize] || totalDuration)
      : totalDuration;
    const idx = Math.floor(i / groupSize) + 1;
    lines.push(String(idx));
    lines.push(`${formatTime(startTime)} --> ${formatTime(endTime)}`);
    lines.push(chunk.join(" "));
    lines.push("");
  }
  return lines.join("\n");
}

// ── Translate text via Gemini ──────────────────────────────────────────────
async function translateText(text: string, targetLang: string, geminiKey: string): Promise<string> {
  const langNames: Record<string, string> = {
    en: "English",
    fr: "French",
    ur: "Urdu",
    tr: "Turkish",
    id: "Indonesian",
    ms: "Malay",
    de: "German",
    es: "Spanish",
  };
  const langName = langNames[targetLang] || targetLang;
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `Translate the following Arabic Islamic supplication (Duaa) to ${langName}. Keep it faithful, reverent and accurate. Output ONLY the translation without any explanation:\n\n${text}`,
        }],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
    });
    return result.response.text().trim();
  } catch {
    return text;
  }
}

// ── Upload SRT captions to YouTube ────────────────────────────────────────
async function uploadYouTubeCaptions(
  accessToken: string,
  videoId: string,
  srtContent: string,
  lang: string
): Promise<boolean> {
  try {
    const boundary = "srtboundary";
    const metadata = JSON.stringify({
      snippet: {
        videoId,
        language: lang,
        name: `Arabic Supplication — ${lang.toUpperCase()}`,
        isDraft: false,
      },
    });
    const body = [
      `--${boundary}`,
      `Content-Type: application/json; charset=UTF-8`,
      ``,
      metadata,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      srtContent,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

// ── Smart bot: fetch channel info from Telegram ───────────────────────────
async function fetchTelegramChannelInfo(channelId: string, botToken: string): Promise<ChannelStat | null> {
  try {
    const chatRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${channelId}`
    );
    const chatData = await chatRes.json() as {
      ok: boolean;
      result?: { title?: string; type?: string; username?: string };
    };
    if (!chatData.ok || !chatData.result) return null;

    const countRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMembersCount?chat_id=${channelId}`
    );
    const countData = await countRes.json() as { ok: boolean; result?: number };
    const memberCount = countData.ok ? (countData.result || 0) : 0;

    return {
      channelId: String(channelId),
      channelName: chatData.result?.title || channelId,
      type: "telegram",
      subscriberCount: memberCount,
      checkedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// ── Smart bot: generate daily Duaa content ───────────────────────────────
const DUAA_STYLES_ALL = [
  "تضرع وخشوع",
  "شكر وحمد",
  "استغفار",
  "رجاء وأمل",
  "توكل وثقة",
  "دعاء الصباح",
  "دعاء المساء",
];

function resolveDuaaStyle(style?: string): string {
  if (!style || style === "عشوائي") {
    return DUAA_STYLES_ALL[Math.floor(Math.random() * DUAA_STYLES_ALL.length)];
  }
  return style;
}

async function generateDailyDuaaContent(geminiKey: string, duaaStyle?: string): Promise<{ duaa: string; title: string; caption: string }> {
  const topic = resolveDuaaStyle(duaaStyle);

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `اكتب ${topic} إسلامياً أصيلاً بالتشكيل الكامل. من 3 إلى 5 أسطر. فقط الدعاء بدون مقدمات.`,
        }],
      }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 300 },
    });
    const duaa = result.response.text().trim();

    const titleResult = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `اكتب عنواناً جذاباً لفيديو ${topic} إسلامي. 4-6 كلمات مع رموز. فقط العنوان.`,
        }],
      }],
      generationConfig: { temperature: 1.2, maxOutputTokens: 50 },
    });
    const title = titleResult.response.text().trim();

    return {
      duaa,
      title,
      caption: buildFacebookDescription(duaa, undefined),
    };
  } catch {
    return {
      duaa: `اللَّهُمَّ إِنَّا نَسْأَلُكَ رَحْمَتَكَ وَمَغْفِرَتَكَ ✨`,
      title: `🤲 ${topic} — سبحان الله`,
      caption: buildFacebookDescription(`اللَّهُمَّ إِنَّا نَسْأَلُكَ رَحْمَتَكَ وَمَغْفِرَتَكَ`, undefined),
    };
  }
}

// ── Smart bot: post text content to managed channels ─────────────────────
async function postToManagedChannels(content: { title: string; body: string }, botToken: string, channelIds: string[]): Promise<void> {
  for (const channelId of channelIds) {
    try {
      const text = `*${content.title}*\n\n${content.body}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
      });
      addLog(`📢 تم النشر في القناة ${channelId}`, "success");
    } catch (err) {
      addLog(`❌ فشل النشر في القناة ${channelId}: ${err instanceof Error ? err.message.slice(0, 40) : "خطأ"}`, "error");
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ── Check if scheduled post should run ────────────────────────────────────
function shouldRunScheduledPost(settings: AppSettings): boolean {
  if (!settings.scheduledFbPostEnabled || !settings.facebookToken) return false;
  const now = new Date();
  const dateKey = now.toDateString();
  if (lastScheduledPostDate === dateKey) return false;

  const [hStr, mStr] = settings.scheduledFbPostTime.split(":");
  const targetH = parseInt(hStr || "8");
  const targetM = parseInt(mStr || "0");
  const nowH = now.getHours();
  const nowM = now.getMinutes();

  if (nowH !== targetH || nowM !== targetM) return false;

  const days = settings.scheduledFbPostDays;
  if (days !== "all") {
    const allowedDays = days.split(",").map(d => parseInt(d.trim()));
    if (!allowedDays.includes(now.getDay())) return false;
  }
  return true;
}

// ── Check if weekly report should run ─────────────────────────────────────
function shouldRunWeeklyReport(settings: AppSettings): boolean {
  if (!settings.autoReportEnabled || !settings.autoReportChatId) return false;
  const now = new Date();
  const weekKey = `${now.getFullYear()}-W${Math.floor(now.getDate() / 7)}-${now.getDay()}`;
  if (lastWeeklyReportDate === weekKey) return false;
  if (now.getDay() !== (settings.weeklyReportDay || 5)) return false;
  if (now.getHours() !== 9 || now.getMinutes() !== 0) return false;
  return true;
}

// ── Main scheduler tick (runs every minute) ───────────────────────────────
async function schedulerTick() {
  const settings = getSettings();
  const botToken = loadCredentials()?.botToken;
  if (!botToken || !botInstance) return;

  // Scheduled Facebook post — always text-only (no video upload)
  if (shouldRunScheduledPost(settings)) {
    const dateKey = new Date().toDateString();
    lastScheduledPostDate = dateKey;
    addLog("⏰ نشر مجدوَل — فيسبوك (نص دعاء)", "info");
    try {
      const { duaa, title, caption } = await generateDailyDuaaContent(geminiKeyStore, settings.scheduledDuaaStyle);
      if (settings.facebookToken) {
        const fbRes = await fetch(`https://graph.facebook.com/v21.0/me/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: duaa.slice(0, 2000), access_token: settings.facebookToken }),
        });
        const fbData = await fbRes.json() as any;
        if (fbRes.ok && fbData.id) {
          const postUrl = `https://facebook.com/${fbData.id}`;
          addLog(`✅ نشر مجدوَل نصي فيسبوك`, "success");
          recordPublish({
            title,
            duaaText: duaa,
            platforms: [{ platform: "فيسبوك", success: true, url: postUrl }],
            scheduled: true,
          });
          // Send duaa copy to all known Telegram chats
          const duaaMsg = [
            `🤲 *${title}*`,
            ``,
            duaa.slice(0, 500),
            ``,
            `━━━━━━━━━━━━━━━`,
            `📘 *تم النشر على فيسبوك*`,
            `_سبحان الله وبحمده سبحان الله العظيم_`,
          ].join("\n");
          for (const chatId of knownChatIds) {
            await botInstance.sendMessage(chatId, duaaMsg, { parse_mode: "Markdown", disable_web_page_preview: true }).catch(() => {});
          }
        } else {
          addLog(`❌ فشل النشر المجدوَل: ${fbData?.error?.message || "خطأ غير محدد"}`, "error");
        }
      }
    } catch (err) {
      addLog(`❌ خطأ في النشر المجدوَل: ${err instanceof Error ? err.message.slice(0, 60) : "خطأ"}`, "error");
    }
  }

  // Weekly analytics report
  if (shouldRunWeeklyReport(settings)) {
    const weekKey = `${new Date().getFullYear()}-W${Math.floor(new Date().getDate() / 7)}-${new Date().getDay()}`;
    lastWeeklyReportDate = weekKey;
    try {
      const summary = getAnalyticsSummary();
      const reportText = buildWeeklyReportText(summary);
      const chatId = parseInt(settings.autoReportChatId);
      if (!isNaN(chatId)) {
        await botInstance.sendMessage(chatId, reportText, { parse_mode: "Markdown" }).catch(() => {});
        addLog("📊 تم إرسال التقرير الأسبوعي", "success");
      }
    } catch (err) {
      addLog(`❌ فشل إرسال التقرير: ${err instanceof Error ? err.message.slice(0, 50) : "خطأ"}`, "error");
    }
  }

  // Smart bot: update channel stats every 6 hours
  if (settings.smartBotEnabled && settings.managedChannelIds) {
    const now = Date.now();
    if (now - lastChannelCheckTime > 6 * 60 * 60 * 1000) {
      lastChannelCheckTime = now;
      const channelIds = settings.managedChannelIds.split(",").map(s => s.trim()).filter(Boolean);
      const stats: ChannelStat[] = [];
      for (const channelId of channelIds) {
        const stat = await fetchTelegramChannelInfo(channelId, botToken);
        if (stat) stats.push(stat);
      }
      if (stats.length > 0) {
        saveChannelStats(stats);
        addLog(`📊 تم تحديث إحصائيات ${stats.length} قناة`, "info");

        // Smart: if channel growth detected, notify admin
        if (settings.smartBotAdminChatId) {
          const adminId = parseInt(settings.smartBotAdminChatId);
          if (!isNaN(adminId)) {
            const lines = stats.map(s =>
              `📡 *${s.channelName}* — ${(s.subscriberCount || 0).toLocaleString()} متابع`
            ).join("\n");
            await botInstance.sendMessage(
              adminId,
              `📊 *تحديث القنوات التلقائي*\n\n${lines}\n\n_تحقق من لوحة التحليلات للتفاصيل_`,
              { parse_mode: "Markdown" }
            ).catch(() => {});
          }
        }
      }
    }

    // Smart bot: post daily inspiration to managed channels (once per day)
    const smartDayKey = `smart-${new Date().toDateString()}`;
    const smartPostedFile = path.join(process.cwd(), "smart-post.json");
    let smartPosted = "";
    try {
      if (fs.existsSync(smartPostedFile)) smartPosted = JSON.parse(fs.readFileSync(smartPostedFile, "utf8"));
    } catch {}

    const smartHour = new Date().getHours();
    if (smartPosted !== smartDayKey && smartHour === 10) {
      try {
        fs.writeFileSync(smartPostedFile, JSON.stringify(smartDayKey), "utf8");
        const channelIds = settings.managedChannelIds.split(",").map(s => s.trim()).filter(Boolean);
        if (channelIds.length > 0) {
          const content = await generateDailyDuaaContent(geminiKeyStore);
          await postToManagedChannels({ title: content.title, body: content.duaa }, botToken, channelIds);
          addLog(`📢 البوت الذكي: نشر تلقائي في ${channelIds.length} قناة`, "success");
        }
      } catch (err) {
        addLog(`⚠️ البوت الذكي فشل في النشر التلقائي: ${err instanceof Error ? err.message.slice(0, 50) : "خطأ"}`, "warning");
      }
    }
  }
}

// ── Start/stop scheduler ───────────────────────────────────────────────────
function startScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    schedulerTick().catch(err => logger.warn({ err }, "Scheduler tick error"));
  }, 60 * 1000);
  addLog("⏰ جدولة المهام التلقائية مُفعَّلة", "info");
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export function triggerScheduledPost(): Promise<void> {
  return schedulerTick();
}

export async function forceTriggerScheduledPost(): Promise<{ success: boolean; message: string }> {
  const settings = getSettings();
  if (!settings.facebookToken) {
    return { success: false, message: "لم تُضف توكن فيسبوك بعد — أضفه من الإعدادات المتقدمة" };
  }
  if (!geminiKeyStore) {
    return { success: false, message: "البوت غير مُشغَّل — شغّل البوت أولاً" };
  }
  try {
    addLog("🔘 تشغيل يدوي للنشر المجدوَل (نص دعاء)...", "info");
    const { duaa, title, caption: _caption } = await generateDailyDuaaContent(geminiKeyStore, settings.scheduledDuaaStyle);

    // Post prayer text only — no description, hashtags, or CTA
    const fbRes = await fetch(`https://graph.facebook.com/v21.0/me/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: duaa.slice(0, 2000), access_token: settings.facebookToken }),
    });
    const fbData = await fbRes.json() as any;

    if (!fbRes.ok || !fbData.id) {
      const errMsg = fbData?.error?.message || "فشل النشر على فيسبوك";
      addLog(`❌ فشل النشر اليدوي: ${errMsg}`, "error");
      return { success: false, message: errMsg };
    }

    addLog(`✅ نشر يدوي نصي فيسبوك`, "success");
    recordPublish({
      title,
      duaaText: duaa,
      platforms: [{ platform: "فيسبوك", success: true, url: `https://facebook.com/${fbData.id}` }],
      scheduled: false,
    });

    if (botInstance && knownChatIds.size > 0) {
      const duaaMsg = [
        `🤲 *${title}*`,
        ``,
        duaa.slice(0, 500),
        ``,
        `━━━━━━━━━━━━━━━`,
        `📘 *تم النشر على فيسبوك*`,
        `_سبحان الله وبحمده سبحان الله العظيم_`,
      ].join("\n");
      for (const chatId of knownChatIds) {
        await botInstance.sendMessage(chatId, duaaMsg, { parse_mode: "Markdown", disable_web_page_preview: true }).catch(() => {});
      }
    }

    return { success: true, message: "✅ تم النشر النصي على فيسبوك" };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : "خطأ غير متوقع";
    addLog(`❌ خطأ في النشر اليدوي: ${msg}`, "error");
    return { success: false, message: msg };
  }
}

export async function listYouTubeChannelVideos(): Promise<{ videos?: Array<{ id: string; title: string; publishedAt: string; thumbnail: string; duration: string; views: number; }>; error?: string }> {
  const settings = getSettings();
  const refreshToken = settings.youtubeToken;
  const clientId = settings.youtubeClientId;
  const clientSecret = settings.youtubeClientSecret;
  if (!refreshToken || !clientId || !clientSecret) {
    return { error: "لم يتم ربط حساب يوتيوب بعد" };
  }
  try {
    const tokenRes = await refreshYouTubeAccessToken(refreshToken, clientId, clientSecret);
    if (!tokenRes.accessToken) return { error: tokenRes.error || "فشل تجديد رمز يوتيوب" };
    const accessToken = tokenRes.accessToken;

    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const chData = await chRes.json() as any;
    const uploadsPlaylistId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return { error: "تعذّر الحصول على قائمة الرفع" };

    const plRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=25`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const plData = await plRes.json() as any;
    const items = plData.items ?? [];
    const videoIds = items.map((it: any) => it.contentDetails?.videoId).filter(Boolean);

    if (videoIds.length === 0) return { videos: [] };

    const detRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const detData = await detRes.json() as any;

    const videos = (detData.items ?? []).map((v: any) => ({
      id: v.id,
      title: v.snippet?.title || "—",
      publishedAt: v.snippet?.publishedAt || "",
      thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
      duration: v.contentDetails?.duration || "",
      views: parseInt(v.statistics?.viewCount || "0"),
    }));

    return { videos };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "خطأ غير متوقع" };
  }
}

export async function deleteYouTubeVideos(videoIds: string[]): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  const settings = getSettings();
  const refreshToken = settings.youtubeToken;
  const clientId = settings.youtubeClientId;
  const clientSecret = settings.youtubeClientSecret;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("لم يتم ربط حساب يوتيوب بعد");
  }
  const tokenRes = await refreshYouTubeAccessToken(refreshToken, clientId, clientSecret);
  if (!tokenRes.accessToken) throw new Error(tokenRes.error || "فشل تجديد رمز يوتيوب");
  const accessToken = tokenRes.accessToken;

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of videoIds) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.status === 204 || res.ok) {
        deleted.push(id);
        addLog(`🗑️ تم حذف الفيديو: ${id}`, "success");
      } else {
        const errBody = await res.json().catch(() => ({})) as any;
        const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
        failed.push({ id, error: errMsg });
        addLog(`❌ فشل حذف الفيديو ${id}: ${errMsg}`, "error");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "خطأ غير متوقع";
      failed.push({ id, error: errMsg });
    }
  }

  return { deleted, failed };
}

export async function listTikTokVideos(): Promise<{ videos?: Array<{ id: string; title: string; cover: string; shareUrl: string; views: number; createdAt: string | null }>; error?: string }> {
  const settings = getSettings();
  const token = settings.tiktokToken;
  if (!token) return { error: "لم يتم ربط حساب تيك توك بعد" };
  try {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,share_url,view_count,create_time",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 20 }),
      }
    );
    const data = await res.json() as any;
    if (!res.ok || (data.error && data.error.code !== "ok")) {
      return { error: data.error?.message || "تعذّر جلب الفيديوهات" };
    }
    const videos = (data.data?.videos ?? []).map((v: any) => ({
      id: v.id,
      title: v.title || "—",
      cover: v.cover_image_url || "",
      shareUrl: v.share_url || `https://www.tiktok.com/video/${v.id}`,
      views: v.view_count ?? 0,
      createdAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    }));
    return { videos };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "خطأ غير متوقع" };
  }
}

export async function deleteTikTokVideos(videoIds: string[]): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  const settings = getSettings();
  const token = settings.tiktokToken;
  if (!token) throw new Error("لم يتم ربط حساب تيك توك بعد");

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of videoIds) {
    try {
      const res = await fetch("https://open.tiktokapis.com/v2/video/delete/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: id }),
      });
      const data = await res.json() as any;
      if (res.ok && (!data.error || data.error.code === "ok")) {
        deleted.push(id);
        addLog(`🗑️ تم حذف فيديو تيك توك: ${id}`, "success");
      } else {
        const errMsg = data.error?.message || `HTTP ${res.status}`;
        failed.push({ id, error: errMsg });
        addLog(`❌ فشل حذف فيديو تيك توك ${id}: ${errMsg}`, "error");
      }
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : "خطأ غير متوقع" });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return { deleted, failed };
}

export async function listFacebookVideos(): Promise<{ videos?: Array<{ id: string; title: string; description: string; thumbnail: string; createdAt: string; views: number }>; error?: string }> {
  const settings = getSettings();
  const token = settings.facebookToken;
  if (!token) return { error: "لم يتم ربط حساب فيسبوك بعد" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/videos?fields=id,title,description,thumbnails,created_time,views&limit=25&access_token=${token}`
    );
    const data = await res.json() as any;
    if (!res.ok || data.error) {
      return { error: data.error?.message || "تعذّر جلب الفيديوهات" };
    }
    const videos = (data.data ?? []).map((v: any) => ({
      id: v.id,
      title: v.title || "—",
      description: v.description || "",
      thumbnail: v.thumbnails?.data?.[0]?.uri || "",
      createdAt: v.created_time || "",
      views: v.views ?? 0,
    }));
    return { videos };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "خطأ غير متوقع" };
  }
}

export async function deleteFacebookVideos(videoIds: string[]): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  const settings = getSettings();
  const token = settings.facebookToken;
  if (!token) throw new Error("لم يتم ربط حساب فيسبوك بعد");

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of videoIds) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${id}?access_token=${token}`,
        { method: "DELETE" }
      );
      const data = await res.json() as any;
      if (res.ok && (data.success === true || data.result === "true")) {
        deleted.push(id);
        addLog(`🗑️ تم حذف فيديو فيسبوك: ${id}`, "success");
      } else {
        const errMsg = data.error?.message || `HTTP ${res.status}`;
        failed.push({ id, error: errMsg });
        addLog(`❌ فشل حذف فيديو فيسبوك ${id}: ${errMsg}`, "error");
      }
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : "خطأ غير متوقع" });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return { deleted, failed };
}

export async function sendManualReport(chatId: number): Promise<string> {
  try {
    const summary = getAnalyticsSummary();
    const reportText = buildWeeklyReportText(summary);
    if (botInstance) {
      await botInstance.sendMessage(chatId, reportText, { parse_mode: "Markdown" });
    }
    return reportText;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "خطأ في إنشاء التقرير");
  }
}

export { getAnalyticsSummary, recordPublish };

// ══════════════════════════════════════════════════════════════
//  REAL PLATFORM ANALYTICS
// ══════════════════════════════════════════════════════════════

export async function fetchYouTubeAnalytics() {
  const settings = getSettings();
  const refreshToken = settings.youtubeToken;
  const clientId = settings.youtubeClientId;
  const clientSecret = settings.youtubeClientSecret;
  if (!refreshToken) return { error: "لم يتم ربط حساب يوتيوب بعد" };

  try {
    // 0. Refresh the access token first (youtubeToken is a refresh token)
    let accessToken = refreshToken;
    if (clientId && clientSecret) {
      const tokenRes = await refreshYouTubeAccessToken(refreshToken, clientId, clientSecret);
      if (tokenRes.accessToken) {
        accessToken = tokenRes.accessToken;
      } else {
        return { error: `فشل تجديد رمز يوتيوب: ${tokenRes.error || "خطأ غير محدد"}` };
      }
    }

    // 1. Channel info + statistics
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    const chData = await chRes.json() as any;
    if (!chRes.ok) {
      const msg = chData.error?.message || "";
      if (msg.toLowerCase().includes("credential") || msg.toLowerCase().includes("auth") || chRes.status === 401) {
        return { error: "انتهت صلاحية رمز يوتيوب — يرجى تجديد الربط من الإعدادات المتقدمة" };
      }
      return { error: msg || "تعذّر جلب بيانات القناة" };
    }
    if (!chData.items?.length) {
      return { error: "لا توجد قناة مرتبطة بهذا الحساب" };
    }

    const ch = chData.items[0];
    const stats = ch.statistics ?? {};
    const channelId = ch.id;

    // 2. Recent uploads playlist
    const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads
      ?? ch.snippet?.thumbnails; // fallback: search instead

    // 3. Recent videos via search
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=10`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    const searchData = await searchRes.json() as any;
    const videoIds: string[] = (searchData.items ?? []).map((v: any) => v.id?.videoId).filter(Boolean);

    // 4. Video stats
    let videos: any[] = [];
    if (videoIds.length > 0) {
      const vidRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}&maxResults=10`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      const vidData = await vidRes.json() as any;
      videos = (vidData.items ?? []).map((v: any) => ({
        id: v.id,
        title: v.snippet?.title,
        publishedAt: v.snippet?.publishedAt,
        thumbnail: v.snippet?.thumbnails?.medium?.url,
        views: parseInt(v.statistics?.viewCount ?? "0"),
        likes: parseInt(v.statistics?.likeCount ?? "0"),
        comments: parseInt(v.statistics?.commentCount ?? "0"),
        duration: v.contentDetails?.duration,
      }));
    }

    // 5. Estimated/Real earnings
    const totalViews = parseInt(stats.viewCount ?? "0");
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    let realRevenue30d: number | null = null;
    try {
      const revenueRes = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&metrics=estimatedRevenue&dimensions=day&startDate=${thirtyDaysAgo}&endDate=${today}&sort=day`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      if (revenueRes.ok) {
        const revenueData = await revenueRes.json() as any;
        if (revenueData.rows?.length) {
          realRevenue30d = revenueData.rows.reduce((sum: number, row: any[]) => sum + (row[1] ?? 0), 0);
        }
      }
    } catch { /* yt-analytics not granted — use estimate only */ }

    // Estimated earnings: RPM range $0.5–$3 typical, use $1.5 as midpoint
    const estLow  = parseFloat(((totalViews / 1000) * 0.5).toFixed(2));
    const estHigh = parseFloat(((totalViews / 1000) * 3.0).toFixed(2));
    const est30dLow  = parseFloat((((videos.reduce((s,v)=>s+v.views,0)) / 1000) * 0.5).toFixed(2));
    const est30dHigh = parseFloat((((videos.reduce((s,v)=>s+v.views,0)) / 1000) * 3.0).toFixed(2));

    return {
      platform: "youtube",
      channel: {
        id: channelId,
        name: ch.snippet?.title,
        description: ch.snippet?.description?.slice(0, 200),
        thumbnail: ch.snippet?.thumbnails?.medium?.url,
        country: ch.snippet?.country,
        subscriberCount: parseInt(stats.subscriberCount ?? "0"),
        viewCount: parseInt(stats.viewCount ?? "0"),
        videoCount: parseInt(stats.videoCount ?? "0"),
        hiddenSubscriberCount: stats.hiddenSubscriberCount ?? false,
      },
      videos,
      earnings: {
        realRevenue30d,
        estTotalLow: estLow,
        estTotalHigh: estHigh,
        est30dLow,
        est30dHigh,
        currency: "USD",
      },
      fetchedAt: Date.now(),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "خطأ غير متوقع" };
  }
}

const FB_VER_AN = "v21.0";

export async function fetchFacebookAnalytics() {
  const settings = getSettings();
  const token = settings.facebookToken;
  if (!token) return { error: "لم يتم ربط حساب فيسبوك بعد" };

  try {
    // 1. Page basic info
    const pageRes = await fetch(
      `https://graph.facebook.com/${FB_VER_AN}/me?fields=id,name,fan_count,followers_count,talking_about_count,category,picture.type(large),cover,about&access_token=${token}`
    );
    const pageData = await pageRes.json() as any;
    if (!pageRes.ok || pageData.error) {
      const msg = pageData.error?.message || "";
      if (pageRes.status === 401 || pageRes.status === 403 || msg.toLowerCase().includes("token") || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("session")) {
        return { error: "انتهت صلاحية رمز فيسبوك — يرجى تجديد الربط من الإعدادات المتقدمة" };
      }
      return { error: msg || "تعذّر جلب بيانات الصفحة" };
    }

    // 2. Page insights (weekly)
    const insightsRes = await fetch(
      `https://graph.facebook.com/${FB_VER_AN}/me/insights?metric=page_impressions,page_impressions_unique,page_engaged_users,page_post_engagements,page_views_total&period=week&access_token=${token}`
    );
    const insightsData = await insightsRes.json() as any;
    const insights: Record<string, number> = {};
    for (const item of (insightsData.data ?? [])) {
      const last = item.values?.at(-1);
      if (last) insights[item.name] = last.value ?? 0;
    }

    // 3. Recent posts with engagement
    const postsRes = await fetch(
      `https://graph.facebook.com/${FB_VER_AN}/me/posts?fields=id,message,story,created_time,likes.summary(true),comments.summary(true),shares,full_picture&limit=10&access_token=${token}`
    );
    const postsData = await postsRes.json() as any;
    const posts = (postsData.data ?? []).map((p: any) => ({
      id: p.id,
      message: p.message?.slice(0, 120) || p.story || "—",
      createdAt: p.created_time,
      picture: p.full_picture,
      likes: p.likes?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
    }));

    const weeklyImpressions = insights.page_impressions ?? 0;
    const monthlyImpressions = weeklyImpressions * 4;
    const fbEstLow  = parseFloat(((monthlyImpressions / 1000) * 0.5).toFixed(2));
    const fbEstHigh = parseFloat(((monthlyImpressions / 1000) * 2.0).toFixed(2));

    return {
      platform: "facebook",
      page: {
        id: pageData.id,
        name: pageData.name,
        about: pageData.about?.slice(0, 200),
        category: pageData.category,
        picture: pageData.picture?.data?.url,
        cover: pageData.cover?.source,
        fanCount: pageData.fan_count ?? 0,
        followersCount: pageData.followers_count ?? pageData.fan_count ?? 0,
        talkingAbout: pageData.talking_about_count ?? 0,
      },
      insights: {
        weeklyImpressions,
        weeklyReach: insights.page_impressions_unique ?? 0,
        weeklyEngaged: insights.page_engaged_users ?? 0,
        weeklyEngagement: insights.page_post_engagements ?? 0,
        weeklyViews: insights.page_views_total ?? 0,
      },
      earnings: {
        estMonthlyLow: fbEstLow,
        estMonthlyHigh: fbEstHigh,
        currency: "USD",
      },
      posts,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "خطأ غير متوقع" };
  }
}

export async function fetchTikTokAnalytics() {
  const settings = getSettings();
  const token = settings.tiktokToken;
  if (!token) return { error: "لم يتم ربط حساب تيك توك بعد" };

  try {
    // 1. User info
    const userRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url,follower_count,following_count,likes_count,video_count,profile_deep_link",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const userData = await userRes.json() as any;
    if (!userRes.ok || (userData.error && userData.error.code !== "ok")) {
      const msg = userData.error?.message || "";
      if (userRes.status === 401 || userRes.status === 403 || msg.toLowerCase().includes("token") || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("auth")) {
        return { error: "انتهت صلاحية رمز تيك توك — يرجى تجديد الربط من الإعدادات المتقدمة" };
      }
      return { error: msg || "تعذّر جلب بيانات المستخدم" };
    }
    const user = userData.data?.user ?? {};

    // 2. Recent videos
    const videosRes = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time,duration",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 10 }),
      }
    );
    const videosData = await videosRes.json() as any;
    const videos = (videosData.data?.videos ?? []).map((v: any) => ({
      id: v.id,
      title: v.title || "—",
      cover: v.cover_image_url,
      shareUrl: v.share_url,
      views: v.view_count ?? 0,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
      createdAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
      duration: v.duration,
    }));

    const ttTotalViews = videos.reduce((s: number, v: any) => s + v.views, 0);
    const ttEstLow  = parseFloat(((ttTotalViews / 1000) * 0.02).toFixed(2));
    const ttEstHigh = parseFloat(((ttTotalViews / 1000) * 0.1).toFixed(2));

    return {
      platform: "tiktok",
      user: {
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar_url,
        profileUrl: user.profile_deep_link,
        followersCount: user.follower_count ?? 0,
        followingCount: user.following_count ?? 0,
        likesCount: user.likes_count ?? 0,
        videoCount: user.video_count ?? 0,
      },
      videos,
      earnings: {
        est10dLow: ttEstLow,
        est10dHigh: ttEstHigh,
        totalViews: ttTotalViews,
        currency: "USD",
      },
      fetchedAt: Date.now(),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "خطأ غير متوقع" };
  }
}

export function fetchBotAnalytics() {
  const summary = getAnalyticsSummary();
  const settings = getSettings();
  return {
    platform: "bot",
    summary,
    connected: {
      youtube: Boolean(settings.youtubeToken),
      facebook: Boolean(settings.facebookToken),
      tiktok: Boolean(settings.tiktokToken),
    },
    fetchedAt: Date.now(),
  };
}

export function addLog(message: string, level: LogLevel = "info") {
  const entry: LogEntry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    message,
    level,
    time: new Date().toLocaleTimeString("ar-EG"),
  };
  logs.push(entry);
  if (logs.length > 200) logs = logs.slice(-200);
  logger.info({ level, message }, "Bot log");
}

export function clearLogs() {
  logs = [];
}

export function getLogs() {
  return logs.slice(-50);
}

export function getBotStatus() {
  return {
    running: botRunning,
    botName,
    botUsername,
    processedCount,
    logs: getLogs(),
    uptime: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
    activeOpsCount: activeOps.size,
    activeOps: getActiveOps(),
  };
}

export async function testBotToken(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = (await res.json()) as { ok: boolean; result?: { first_name: string; username: string }; description?: string };
  if (data.ok && data.result) {
    return { success: true, botName: data.result.first_name, botUsername: data.result.username };
  }
  return { success: false, error: data.description || "توكن غير صالح" };
}

// ── Social media key testing ──────────────────────────────────────────────

async function refreshYouTubeAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ accessToken?: string; error?: string }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
    if (!res.ok || !data.access_token) {
      return { error: data.error_description || data.error || `فشل تجديد التوكن (${res.status})` };
    }
    return { accessToken: data.access_token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testYouTubeToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ success: boolean; channelName?: string; channelId?: string; subscribers?: string; error?: string }> {
  try {
    const tokenRes = await refreshYouTubeAccessToken(refreshToken, clientId, clientSecret);
    if (!tokenRes.accessToken) {
      return { success: false, error: tokenRes.error || "فشل الحصول على access token" };
    }
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${tokenRes.accessToken}` } }
    );
    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `خطأ ${res.status}` };
    }
    const data = await res.json() as { items?: Array<{ snippet: { title: string }; id: string; statistics: { subscriberCount: string } }> };
    const ch = data.items?.[0];
    if (!ch) return { success: false, error: "لم يُعثر على قناة مرتبطة بهذه البيانات" };
    const subs = parseInt(ch.statistics?.subscriberCount || "0");
    const subsStr = subs >= 1000000 ? `${(subs/1000000).toFixed(1)}M` : subs >= 1000 ? `${(subs/1000).toFixed(1)}K` : String(subs);
    return { success: true, channelName: ch.snippet.title, channelId: ch.id, subscribers: subsStr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testFacebookToken(token: string): Promise<{ success: boolean; pageName?: string; pageId?: string; followers?: string; error?: string }> {
  const FB_VER = "v21.0";

  const parseFollowers = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
    : String(n);

  try {
    // 1. Try /me directly — works for both User and Page tokens
    const meRes = await fetch(
      `https://graph.facebook.com/${FB_VER}/me?fields=name,id,fan_count,followers_count&access_token=${token}`
    );
    if (meRes.ok) {
      const me = await meRes.json() as { name?: string; id?: string; fan_count?: number; followers_count?: number; error?: { message?: string } };
      if (me.name && !me.error) {
        const f = me.fan_count || me.followers_count || 0;
        return { success: true, pageName: me.name, pageId: me.id, followers: f > 0 ? parseFollowers(f) : undefined };
      }
      if (me.error) {
        return { success: false, error: me.error.message };
      }
    }

    // 2. Fallback: try /me/accounts (works for User tokens with pages)
    const accountsRes = await fetch(
      `https://graph.facebook.com/${FB_VER}/me/accounts?fields=name,id,fan_count&access_token=${token}`
    );
    if (accountsRes.ok) {
      const accounts = await accountsRes.json() as { data?: Array<{ name: string; id: string; fan_count?: number }>; error?: { message?: string } };
      if (accounts.error) return { success: false, error: accounts.error.message };
      const page = accounts.data?.[0];
      if (page) {
        const f = page.fan_count || 0;
        return { success: true, pageName: page.name, pageId: page.id, followers: f > 0 ? parseFollowers(f) : undefined };
      }
    }

    return { success: false, error: "لم يُعثر على صفحة أو حساب مرتبط بهذا التوكن" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testTikTokToken(token: string): Promise<{ success: boolean; username?: string; displayName?: string; followers?: string; error?: string }> {
  try {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,follower_count",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `خطأ ${res.status}` };
    }
    const data = await res.json() as { data?: { user?: { display_name?: string; username?: string; follower_count?: number } } };
    const user = data.data?.user;
    if (!user) return { success: false, error: "لم يُعثر على حساب مرتبط بهذا التوكن" };
    const f = user.follower_count || 0;
    const followersStr = f >= 1000000 ? `${(f/1000000).toFixed(1)}M` : f >= 1000 ? `${(f/1000).toFixed(1)}K` : String(f);
    return { success: true, username: user.username, displayName: user.display_name, followers: followersStr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Social media publishing ───────────────────────────────────────────────

async function generateVideoTitle(geminiKey: string, topic?: string): Promise<string> {
  const topicLine = topic
    ? `موضوع الفيديو: "${topic}" — ابنِ العنوان حول هذا الموضوع مع تجليل الله وتمجيده.`
    : `موضوع الفيديو: عام — اختر مخلوقاً أو ظاهرة طبيعية تجلّي عظمة الله.`;

  const prompt = `أنت متخصص في كتابة عناوين فيديوهات إسلامية احترافية تجمع بين الجمال والمحتوى الديني.

${topicLine}

الشروط الصارمة:
- من 4 إلى 7 كلمات فقط لا أكثر
- يشمل 2 إلى 3 رموز تعبيرية مناسبة للموضوع
- يذكر الله أو يسبّحه أو يجلّله بشكل صريح
- أسلوب راقٍ شاعري يشدّ القارئ
- لا تكتب سوى العنوان فقط بدون أي شرح أو مقدمة أو علامات اقتباس

أمثلة على الأسلوب المطلوب:
🦁 سبحان الله في خلق الأسد ✨
🌊 الله أكبر في أعماق البحار 💫
🦅 تسبّح له الطيور بحمده 🌿
🐈 من آيات الله في خلق القطط 🤲
العنوان:`;

  const fallbacksGeneral = [
    "🦁 سبحان الله في بديع خلقه ✨",
    "🌿 من آيات الله في الخلق 💫",
    "🦅 الله أكبر في إبداع الكون 🌟",
    "🌊 عظمة الله في مخلوقاته 🤲",
    "🦋 تسبّح له السماوات والأرض ✨",
    "🌺 سبحان الخالق البديع 💎",
    "🐬 آيات الله في البحار والأنهار 🌟",
    "🌄 جلال الله في صنعه البديع 🤲",
  ];
  const fallbackTopic = topic
    ? `✨ سبحان الله في خلق ${topic} 🤲`
    : fallbacksGeneral[Math.floor(Math.random() * fallbacksGeneral.length)];
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.2, maxOutputTokens: 100 },
    });
    const raw = result.response.text().trim()
      .split("\n")[0]
      .replace(/^["'«»\-–—*#:]+|["'«»\-–—*#:]+$/g, "")
      .trim();
    if (raw.length >= 10 && raw.length <= 150) {
      addLog(`✅ العنوان الذكي: ${raw}`, "success");
      return raw;
    }
  } catch (err) {
    addLog(`⚠️ فشل توليد العنوان: ${err instanceof Error ? err.message.slice(0, 50) : "خطأ"}`, "warning");
  }
  addLog(`📌 العنوان الاحتياطي: ${fallbackTopic}`, "info");
  return fallbackTopic;
}

function formatArabicDate(): string {
  const now = new Date();
  const arabicDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const dayName = arabicDays[now.getDay()];
  const day = now.getDate();
  const month = arabicMonths[now.getMonth()];
  const year = now.getFullYear();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "م" : "ص";
  const h12 = hours % 12 || 12;
  return `${dayName} ${day} ${month} ${year} — ${h12}:${minutes} ${period}`;
}

function formatFileSize(filePath: string): string {
  try {
    const bytes = fs.statSync(filePath).size;
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} جيجابايت`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} ميجابايت`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
    return `${bytes} بايت`;
  } catch {
    return "غير معروف";
  }
}

// ── YouTube & Facebook content builders ──────────────────────────────────

function buildYouTubeTags(duaaText: string, isShort = false): string[] {
  const coreTags = [
    "دعاء", "إسلامي", "قرآن كريم", "تسبيح", "ذكر الله",
    "معجزات الله", "سبحان الله", "الله أكبر", "الحمد لله",
    "دعاء مؤثر", "دعاء يبكي", "أذكار", "إسلام",
    "دعاء اليوم", "طبيعة إسلامية", "خلق الله", "islamic",
  ];
  if (isShort) coreTags.push("Shorts", "YouTube Shorts", "islamicshorts", "arabicshorts");
  const arabicWords = duaaText
    .replace(/[ًٌٍَُِّْ]/g, "")
    .split(/\s+/)
    .filter(w => /^[\u0621-\u064A]{3,}$/.test(w))
    .slice(0, 4);
  return [...new Set([...coreTags, ...arabicWords])].slice(0, 15);
}

function buildYouTubeDescription(duaaText: string, customDesc: string | undefined, isShort: boolean): string {
  const cta = isShort
    ? "🔔 اشترك للمزيد من مقاطع الدعاء\n👍 أعجبك؟ شاركه وانشر الخير 🤍"
    : [
        "🔔 اشترك في القناة وفعّل جرس التنبيهات لتصلك مقاطع الدعاء يومياً",
        "👍 لا تنسَ الإعجاب ومشاركة الفيديو — كل مشاركة صدقة جارية",
        "💬 اترك تعليقاً بدعائك المفضل",
        "🔁 أعد التشغيل لتستمع مراراً وتتدبر",
      ].join("\n");
  const hashtags = [
    "#دعاء", "#إسلام", "#سبحان_الله", "#معجزات_الله", "#الله_أكبر",
    "#الحمد_لله", "#ذكر_الله", "#دعاء_مؤثر", "#تسبيح", "#قرآن_كريم",
    "#دعاء_اليوم", "#اسلاميات", "#خلق_الله", "#صدقة_جارية", "#نشر_الخير",
  ];
  if (isShort) hashtags.push("#Shorts", "#YouTubeShorts", "#islamicshorts");
  const lines: string[] = [`🤲 ${duaaText}`, "", "━━━━━━━━━━", cta];
  if (customDesc) lines.push("", `📝 ${customDesc}`);
  lines.push("", "━━━━━━━━━━", hashtags.join(" "));
  return lines.join("\n");
}

function buildFacebookDescription(duaaText: string, customDesc: string | undefined): string {
  const cta = [
    "👍 أعجبك؟ شاركه لتعم الفائدة ويصل الخير للجميع",
    "🔔 تابع الصفحة للمزيد من مقاطع الدعاء والذكر",
    "💬 اكتب في التعليقات «آمين» وشاركنا دعاءك",
  ].join("\n");
  const hashtags = [
    "#دعاء", "#إسلام", "#سبحان_الله", "#معجزات_الله", "#الله_أكبر",
    "#الحمد_لله", "#ذكر_الله", "#دعاء_مؤثر", "#قرآن_كريم",
    "#دعاء_اليوم", "#اسلاميات", "#خلق_الله", "#صدقة_جارية", "#نشر_الخير",
    "#طبيعة_إسلامية", "#تأمل",
  ].join(" ");
  const lines: string[] = [`🤲 ${duaaText}`, "", "━━━━━━━━━━", cta];
  if (customDesc) lines.push("", `📝 ${customDesc}`);
  lines.push("", "━━━━━━━━━━", hashtags);
  return lines.join("\n");
}

async function uploadVideoToYouTube(
  accessToken: string,
  videoBuffer: Buffer,
  title: string,
  description: string,
  tags: string[],
  label: string
): Promise<{ success: boolean; videoId?: string; url?: string; isShort: boolean; error?: string }> {
  const isShort = label === "Short";
  const videoSize = videoBuffer.length;
  try {
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(videoSize),
        },
        body: JSON.stringify({
          snippet: {
            title: title.slice(0, 100),
            description,
            defaultLanguage: "ar",
            tags: [...new Set(tags)].slice(0, 15),
            categoryId: "22",
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
        }),
      }
    );
    if (!initRes.ok) {
      const err = await initRes.json() as { error?: { message?: string } };
      return { success: false, isShort, error: err.error?.message || `فشل تهيئة الرفع (${label}): ${initRes.status}` };
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) return { success: false, isShort, error: `لم يُعثر على رابط الرفع (${label})` };
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(videoSize) },
      body: videoBuffer,
    });
    if (!uploadRes.ok && uploadRes.status !== 308) {
      return { success: false, isShort, error: `فشل رفع الفيديو (${label}): ${uploadRes.status}` };
    }
    const result = await uploadRes.json() as { id?: string };
    const videoId = result.id;
    if (!videoId) return { success: false, isShort, error: `لم يُعثر على معرف الفيديو (${label})` };
    const url = isShort ? `https://youtube.com/shorts/${videoId}` : `https://youtu.be/${videoId}`;
    return { success: true, isShort, videoId, url };
  } catch (err) {
    return { success: false, isShort, error: err instanceof Error ? err.message : String(err) };
  }
}

async function publishToYouTube(
  videoPath: string,
  title: string,
  duaaText: string,
  customDesc: string | undefined,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{
  success: boolean;
  videoId?: string; url?: string;
  shortId?: string; shortUrl?: string;
  channelName?: string;
  error?: string;
}> {
  try {
    addLog("📺 رفع الفيديو على يوتيوب...", "processing");

    const tokenRes = await refreshYouTubeAccessToken(refreshToken, clientId, clientSecret);
    if (!tokenRes.accessToken) {
      return { success: false, error: tokenRes.error || "فشل الحصول على access token" };
    }
    const accessToken = tokenRes.accessToken;

    let channelName: string | undefined;
    try {
      const chRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (chRes.ok) {
        const chData = await chRes.json() as { items?: Array<{ snippet: { title: string } }> };
        channelName = chData.items?.[0]?.snippet?.title;
      }
    } catch {}

    const videoBuffer = fs.readFileSync(videoPath);

    // ── Regular video upload ──────────────────────────────────────────────
    addLog("📤 يوتيوب: رفع الفيديو العادي...", "processing");
    const regularDesc = buildYouTubeDescription(duaaText, customDesc, false);
    const regularTags = buildYouTubeTags(duaaText, false);
    const regularRes = await uploadVideoToYouTube(accessToken, videoBuffer, title, regularDesc, regularTags, "عادي");

    // ── YouTube Short upload ──────────────────────────────────────────────
    addLog("📤 يوتيوب: رفع الـ Short...", "processing");
    const shortTitle = `${title} #Shorts`.slice(0, 100);
    const shortDesc = buildYouTubeDescription(duaaText, customDesc, true);
    const shortTags = buildYouTubeTags(duaaText, true);
    const shortRes = await uploadVideoToYouTube(accessToken, videoBuffer, shortTitle, shortDesc, shortTags, "Short");

    if (regularRes.success) addLog(`✅ يوتيوب (عادي): ${regularRes.url}`, "success");
    else addLog(`❌ يوتيوب (عادي): ${regularRes.error}`, "error");
    if (shortRes.success) addLog(`✅ يوتيوب (Short): ${shortRes.url}`, "success");
    else addLog(`❌ يوتيوب (Short): ${shortRes.error}`, "error");

    if (!regularRes.success && !shortRes.success) {
      return { success: false, error: regularRes.error || shortRes.error };
    }

    // ── Auto SRT captions ─────────────────────────────────────────────────
    const settings = getSettings();
    if (settings.youtubeAutoCaption && regularRes.videoId) {
      try {
        addLog("📝 جاري توليد الترجمة وإضافة Captions...", "processing");
        const words = duaaText.replace(/[ًٌٍَُِّْ]/g, "").split(/\s+/).filter(Boolean);
        const avgWordDur = 0.5;
        const timings = words.map((_, i) => i * avgWordDur);
        const totalDur = words.length * avgWordDur + 1;

        const arabicSRT = generateSRT(words, timings, totalDur);
        await uploadYouTubeCaptions(accessToken, regularRes.videoId, arabicSRT, "ar");
        addLog("✅ Captions عربية: تمت الإضافة", "success");

        if (settings.captionTranslateLang && settings.captionTranslateLang !== "ar") {
          const translated = await translateText(duaaText, settings.captionTranslateLang, geminiKeyStore);
          const transWords = translated.split(/\s+/).filter(Boolean);
          const transSRT = generateSRT(transWords, timings, totalDur);
          await uploadYouTubeCaptions(accessToken, regularRes.videoId, transSRT, settings.captionTranslateLang);
          addLog(`✅ Captions ${settings.captionTranslateLang.toUpperCase()}: تمت الإضافة`, "success");
        }
      } catch (captionErr) {
        addLog(`⚠️ Captions: ${captionErr instanceof Error ? captionErr.message.slice(0, 50) : "خطأ"}`, "warning");
      }
    }

    return {
      success: true,
      videoId: regularRes.videoId, url: regularRes.url,
      shortId: shortRes.videoId, shortUrl: shortRes.url,
      channelName,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function publishToFacebook(videoPath: string, title: string, description: string, token: string): Promise<{ success: boolean; videoId?: string; url?: string; pageId?: string; pageName?: string; error?: string }> {
  const FB_VER = "v21.0";
  try {
    addLog("📘 نشر الفيديو على فيسبوك...", "processing");

    let pageId = "me";
    let pageToken = token;
    let pageName: string | undefined;

    const meRes = await fetch(`https://graph.facebook.com/${FB_VER}/me?fields=id,name&access_token=${token}`);
    if (meRes.ok) {
      const me = await meRes.json() as { id?: string; name?: string; error?: unknown };
      if (me.id && !me.error) {
        pageId = me.id;
        pageName = me.name;
      }
    }

    const accountsRes = await fetch(`https://graph.facebook.com/${FB_VER}/me/accounts?fields=id,name,access_token&access_token=${token}`);
    if (accountsRes.ok) {
      const accounts = await accountsRes.json() as { data?: Array<{ id: string; name: string; access_token: string }> };
      if (accounts.data?.[0]) {
        pageId = accounts.data[0].id;
        pageToken = accounts.data[0].access_token || token;
        pageName = accounts.data[0].name || pageName;
      }
    }

    const videoBuffer = fs.readFileSync(videoPath);
    const formData = new FormData();
    formData.append("title", title.slice(0, 100));
    formData.append("description", description);
    formData.append("access_token", pageToken);
    formData.append("source", new Blob([videoBuffer], { type: "video/mp4" }), "video.mp4");

    const res = await fetch(`https://graph.facebook.com/${FB_VER}/${pageId}/videos`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `فشل النشر: ${res.status}` };
    }

    const result = await res.json() as { id?: string };
    const videoId = result.id;
    return { success: true, videoId, url: `https://www.facebook.com/watch/?v=${videoId}`, pageId, pageName };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function publishToTikTok(videoPath: string, title: string, description: string, token: string): Promise<{ success: boolean; publishId?: string; username?: string; displayName?: string; error?: string }> {
  try {
    addLog("🎵 نشر الفيديو على تيك توك...", "processing");

    // Fetch TikTok username
    let username: string | undefined;
    let displayName: string | undefined;
    try {
      const userRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (userRes.ok) {
        const ud = await userRes.json() as { data?: { user?: { display_name?: string; username?: string } } };
        username = ud.data?.user?.username;
        displayName = ud.data?.user?.display_name;
      }
    } catch {}

    const videoBuffer = fs.readFileSync(videoPath);
    const videoSize = videoBuffer.length;

    const postTitle = title.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").trim().slice(0, 150) || description.slice(0, 150);

    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: postTitle,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `فشل تهيئة تيك توك: ${initRes.status}` };
    }

    const initData = await initRes.json() as { data?: { publish_id?: string; upload_url?: string }; error?: { message?: string } };
    if (initData.error?.message) return { success: false, error: initData.error.message };

    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;
    if (!uploadUrl || !publishId) return { success: false, error: "لم يُعثر على رابط الرفع من تيك توك" };

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
        "Content-Length": String(videoSize),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      return { success: false, error: `فشل رفع تيك توك: ${uploadRes.status}` };
    }

    return { success: true, publishId, username, displayName };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── High-quality re-encoding for publishing ───────────────────────────────
async function reencodeHighQuality(inputPath: string, outputPath: string): Promise<void> {
  const cmd = [
    "ffmpeg",
    `-i "${inputPath}"`,
    `-c:v libx264`,
    `-preset slow`,
    `-crf 16`,
    `-profile:v high`,
    `-level 4.1`,
    `-pix_fmt yuv420p`,
    `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"`,
    `-r 30`,
    `-c:a aac`,
    `-b:a 192k`,
    `-ar 48000`,
    `-ac 2`,
    `-movflags +faststart`,
    `-y "${outputPath}"`,
  ].join(" ");
  await execAsync(cmd, { timeout: 600000 });
}

type PlatformFilter = "youtube" | "facebook" | "tiktok";

async function handlePublish(chatId: number, settings: AppSettings, platformFilter?: PlatformFilter[], topic?: string) {
  const last = loadLastVideo();
  if (!last) {
    await botInstance!.sendMessage(
      chatId,
      "⚠️ *لا يوجد فيديو سابق للنشر!*\n\nقم بمعالجة فيديو أولاً ثم أرسل *نشر*.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const wantYT = !platformFilter || platformFilter.includes("youtube");
  const wantFB = !platformFilter || platformFilter.includes("facebook");
  const wantTT = !platformFilter || platformFilter.includes("tiktok");

  const hasYT = wantYT && Boolean(settings.youtubeToken && settings.youtubeClientId && settings.youtubeClientSecret);
  const hasFB = wantFB && Boolean(settings.facebookToken);
  const hasTT = wantTT && Boolean(settings.tiktokToken);

  if (!hasYT && !hasFB && !hasTT) {
    if (platformFilter) {
      const names = platformFilter.map(p =>
        p === "youtube" ? "يوتيوب" : p === "facebook" ? "فيسبوك" : "تيك توك"
      ).join(" و");
      await botInstance!.sendMessage(
        chatId,
        `⚠️ *لم تُضف مفاتيح ${names}!*\n\nأضفها من لوحة التحكم ثم حاول مجدداً.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await botInstance!.sendMessage(
        chatId,
        "⚠️ *لم تُضف مفاتيح منصات التواصل!*\n\nأضف مفاتيح يوتيوب أو فيسبوك أو تيك توك من لوحة التحكم.",
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  const platformNames = [hasYT && "📺 يوتيوب", hasFB && "📘 فيسبوك", hasTT && "🎵 تيك توك"].filter(Boolean).join(" — ");
  const statusMsg = await botInstance!.sendMessage(
    chatId,
    `⏳ *جاري توليد العنوان والنشر...*\n\n${platformNames}\n\n_يرجى الانتظار، قد يستغرق ذلك دقيقة..._`,
    { parse_mode: "Markdown" }
  );

  const publishStartTime = Date.now();

  // ── Step 1: Generate AI title ─────────────────────────────────────────
  addLog("🏷️ جاري توليد العنوان...", "processing");
  const title = await generateVideoTitle(geminiKeyStore || settings.youtubeClientId || "", topic);

  // ── Step 2: Re-encode at highest quality for publishing ───────────────
  const hqVideoPath = last.videoPath.replace(/\.mp4$/, "-hq.mp4");
  let publishVideoPath = last.videoPath;
  try {
    await botInstance!.editMessageText(
      `⏳ *جاري تهيئة الفيديو بجودة عالية...*\n\n🎬 تحسين جودة الفيديو للنشر الاحترافي\n\n_${title}_`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    ).catch(() => {});
    addLog("🎬 إعادة ترميز الفيديو بجودة عالية...", "processing");
    await reencodeHighQuality(last.videoPath, hqVideoPath);
    publishVideoPath = hqVideoPath;
    addLog("✅ تم تحسين جودة الفيديو للنشر", "success");
  } catch (encodeErr) {
    addLog(`⚠️ لم يمكن تحسين الجودة، سيُستخدم الأصلي: ${encodeErr instanceof Error ? encodeErr.message.slice(0, 50) : "خطأ"}`, "warning");
  }

  // Duaa text and optional custom description
  const customDesc = settings.publishDescription?.trim();

  const videoSize = formatFileSize(last.videoPath);
  const publishDate = formatArabicDate();

  interface PlatformResult {
    platform: string;
    icon: string;
    success: boolean;
    channelName?: string;
    url?: string;
    shortUrl?: string;
    error?: string;
    extra?: string;
  }
  const platformResults: PlatformResult[] = [];

  if (hasYT) {
    await botInstance!.editMessageText(
      `⏳ *جاري النشر...*\n\n📺 *يوتيوب:* جاري رفع الفيديو + الـ Short...\n\n_${title}_`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    ).catch(() => {});
    const ytRes = await publishToYouTube(
      publishVideoPath, title, last.duaaText, customDesc,
      settings.youtubeToken, settings.youtubeClientId, settings.youtubeClientSecret
    );
    if (ytRes.success) {
      platformResults.push({
        platform: "يوتيوب", icon: "📺", success: true,
        channelName: ytRes.channelName, url: ytRes.url, shortUrl: ytRes.shortUrl,
      });
    } else {
      platformResults.push({ platform: "يوتيوب", icon: "📺", success: false, error: ytRes.error });
      addLog(`❌ فشل يوتيوب: ${ytRes.error}`, "error");
    }
  }

  if (hasFB) {
    const prevYTStatus = hasYT
      ? (platformResults.find(r => r.platform === "يوتيوب")?.success ? "✅ يوتيوب: تم\n" : "❌ يوتيوب: فشل\n")
      : "";
    await botInstance!.editMessageText(
      `⏳ *جاري النشر...*\n\n${prevYTStatus}📘 *فيسبوك:* جاري الرفع...`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    ).catch(() => {});
    const fbDesc = buildFacebookDescription(last.duaaText, customDesc);
    const fbRes = await publishToFacebook(publishVideoPath, title, fbDesc, settings.facebookToken);
    if (fbRes.success) {
      platformResults.push({ platform: "فيسبوك", icon: "📘", success: true, channelName: fbRes.pageName, url: fbRes.url });
      addLog(`✅ فيسبوك: ${fbRes.url}`, "success");
    } else {
      platformResults.push({ platform: "فيسبوك", icon: "📘", success: false, error: fbRes.error });
      addLog(`❌ فشل فيسبوك: ${fbRes.error}`, "error");
    }
  }

  if (hasTT) {
    const ttDesc = `🤲 ${last.duaaText}\n\n${["#دعاء", "#إسلام", "#سبحان_الله", "#الله_أكبر", "#Shorts"].join(" ")}`;
    const ttRes = await publishToTikTok(publishVideoPath, title, ttDesc, settings.tiktokToken);
    if (ttRes.success) {
      const ttName = ttRes.displayName || (ttRes.username ? `@${ttRes.username}` : undefined);
      platformResults.push({ platform: "تيك توك", icon: "🎵", success: true, channelName: ttName, extra: "قيد المراجعة" });
      addLog(`✅ تيك توك: تم الإرسال للمراجعة`, "success");
    } else {
      platformResults.push({ platform: "تيك توك", icon: "🎵", success: false, error: ttRes.error });
      addLog(`❌ فشل تيك توك: ${ttRes.error}`, "error");
    }
  }

  // Cleanup HQ temp file
  if (publishVideoPath !== last.videoPath) {
    try { fs.unlinkSync(publishVideoPath); } catch {}
  }

  // ── Record analytics ────────────────────────────────────────────────────
  try {
    recordPublish({
      title,
      duaaText: last.duaaText,
      platforms: platformResults.map(r => ({
        platform: r.platform,
        success: r.success,
        url: r.url,
        videoId: undefined,
        channelName: r.channelName,
        error: r.error,
      })),
      videoSize,
      duration: Math.round((Date.now() - publishStartTime) / 1000),
    });
  } catch {}

  const publishDuration = Math.round((Date.now() - publishStartTime) / 1000);
  const successCount = platformResults.filter(r => r.success).length;
  const failCount = platformResults.filter(r => !r.success).length;

  // Build professional detailed summary message
  const platformLines = platformResults.map(r => {
    if (r.success) {
      const channelLine = r.channelName ? `\n   📡 *القناة:* ${r.channelName}` : "";
      const urlLine = r.url ? `\n   🔗 [مشاهدة الفيديو](${r.url})` : "";
      const shortLine = r.shortUrl ? `\n   ▶️ [مشاهدة الـ Short](${r.shortUrl})` : "";
      const extraLine = r.extra ? `\n   ⏳ ${r.extra}` : "";
      return `${r.icon} *${r.platform}* ✅${channelLine}${urlLine}${shortLine}${extraLine}`;
    } else {
      return `${r.icon} *${r.platform}* ❌\n   ⚠️ ${r.error?.slice(0, 80) || "خطأ غير معروف"}`;
    }
  }).join("\n\n");

  const statusIcon = failCount === 0 ? "🎉" : successCount === 0 ? "❌" : "⚠️";
  const statusText = failCount === 0
    ? "تم النشر بنجاح على جميع المنصات!"
    : successCount === 0
    ? "فشل النشر على جميع المنصات"
    : `تم النشر على ${successCount} من ${platformResults.length} منصات`;

  const duaaPreview = last.duaaText.length > 100
    ? last.duaaText.slice(0, 100) + "..."
    : last.duaaText;

  const summaryMessage = [
    `${statusIcon} *${statusText}*`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `📅 *التاريخ:* ${publishDate}`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    `📋 *تفاصيل المنشور:*`,
    `🏷️ *العنوان:* ${title}`,
    `📖 *الدعاء:* _${duaaPreview}_`,
    customDesc ? `📝 *وصف إضافي:* ${customDesc}` : "",
    ``,
    `━━━━━━━━━━━━━━━━`,
    `📡 *المنصات المنشور عليها:*`,
    ``,
    platformLines,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `📊 *إحصائيات النشر:*`,
    `⏱️ *وقت النشر:* ${publishDuration} ثانية`,
    `🎬 *حجم الفيديو:* ${videoSize}`,
    `🏆 *جودة النشر:* ${publishVideoPath !== last.videoPath ? "عالية جداً (CRF 16 — preset slow)" : "قياسية"}`,
    `📱 *عدد المنصات:* ${successCount}/${platformResults.length} منصة`,
    hasYT && platformResults.find(r => r.platform === "يوتيوب")?.shortUrl
      ? `▶️ *يوتيوب Shorts:* منشور بنجاح` : "",
    ``,
    `━━━━━━━━━━━━━━━━`,
    `🤲 _بارك الله فيك وفي جهودك_`,
    `_سبحان الله وبحمده سبحان الله العظيم_`,
  ].filter(line => line !== "").join("\n");

  await botInstance!.editMessageText(summaryMessage, {
    chat_id: chatId,
    message_id: statusMsg.message_id,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  } as Parameters<typeof botInstance.editMessageText>[1]).catch(async () => {
    // If edit fails (message too long), send new message
    await botInstance!.sendMessage(chatId, summaryMessage, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    } as Parameters<typeof botInstance.sendMessage>[1]).catch(() => {});
  });
}

export async function startBot(geminiKey: string, botToken: string, settings: AppSettings, groqKey = "", isAutoStart = false) {
  if (botRunning) {
    return { success: false, message: "البوت يعمل بالفعل" };
  }

  const test = await testBotToken(botToken);
  if (!test.success) {
    return { success: false, message: `توكن غير صالح: ${test.error}` };
  }

  geminiKeyStore = geminiKey;
  groqKeyStore = groqKey;
  botName = test.botName || "";
  botUsername = test.botUsername || "";
  processedCount = 0;
  startTime = Date.now();

  saveCredentials(botToken, geminiKey, groqKey);

  const proxyUrl = getProxyUrl();
  const botOptions: ConstructorParameters<typeof TelegramBot>[1] = { polling: true };
  if (proxyUrl) {
    (botOptions as any).request = { proxy: proxyUrl };
    addLog(`🔗 البوت يستخدم البروكسي: ${proxyUrl}`, "info");
  }
  botInstance = new TelegramBot(botToken, botOptions);
  botRunning = true;

  startScheduler();

  addLog(`✅ تم تشغيل البوت: ${botName} (@${botUsername})${isAutoStart ? " (تشغيل تلقائي)" : ""}`, "success");

  if (isAutoStart && knownChatIds.size > 0) {
    setTimeout(async () => {
      for (const chatId of knownChatIds) {
        try {
          await botInstance!.sendMessage(
            chatId,
            `🟢 *البوت عاد للعمل!*\n\nتم إعادة تشغيل البوت تلقائياً وهو جاهز لاستقبال الفيديوهات. 🤲`,
            { parse_mode: "Markdown" }
          );
        } catch { }
      }
    }, 3000);
  }

  botInstance.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    trackChat(chatId);
    const name = msg.from?.first_name || "صديقي";
    addLog(`👤 مستخدم جديد: ${name}`, "info");
    await botInstance!.sendMessage(
      chatId,
      `🌟 *أهلاً ${name}!*\n\nأنا بوت الدعاء الذكي 🤲\n\n📌 *كيف أعمل:*\n• أرسل فيديو مباشرةً → أضع عليه الدعاء فوراً\n• أو أرسل *ابدا* لدمج عدة مقاطع مرقمة\n\n📋 *أوامر مفيدة:*\n• *حالة* → معرفة العمليات الجارية\n• *توقف* → إيقاف المعالجة الحالية\n• *نشر* → نشر آخر فيديو على منصات التواصل\n\n🎬 *جرّب الآن!*`,
      { parse_mode: "Markdown" }
    );
  });

  botInstance.onText(/\/help/, async (msg) => {
    await botInstance!.sendMessage(
      msg.chat.id,
      `📖 *مساعدة - بوت الدعاء الذكي*\n\n*فيديو مباشر:*\nأرسل فيديو واحد → يُعالج فوراً\n\n*دمج متعدد:*\n1️⃣ أرسل *ابدا*\n2️⃣ أرسل الفيديوهات مع أرقام في الوصف (1، 2، 3...)\n3️⃣ أرسل *ابدا* → يدمجها والدعاء يظهر على المقطع الأخير\n\n📋 *الأوامر النصية:*\n• *حالة* → العمليات الجارية\n• *توقف* → إيقاف معالجتك الحالية\n• *نشر* → نشر آخر فيديو على منصات التواصل الاجتماعي\n\n/start - بدء التشغيل`,
      { parse_mode: "Markdown" }
    );
  });

  const showVideoChoiceMenu = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    pendingVideoChoices.set(chatId, msg);
    await botInstance!.sendMessage(
      chatId,
      `📹 *استُقبل الفيديو!*\n\nماذا تريد أن أفعل به؟\n\n*1️⃣* — نشر مباشرةً على القنوات\n*2️⃣* — إضافة الدعاء على الفيديو\n*3️⃣* — إلغاء\n\n_أرسل الرقم للتأكيد_`,
      { parse_mode: "Markdown" }
    );
  };

  botInstance.on("video", async (msg) => {
    trackChat(msg.chat.id);
    const session = chatSessions.get(msg.chat.id);
    if (session) {
      await addVideoToSession(msg, session);
    } else {
      await showVideoChoiceMenu(msg);
    }
  });

  botInstance.on("document", async (msg) => {
    if (msg.document?.mime_type?.startsWith("video/")) {
      trackChat(msg.chat.id);
      const session = chatSessions.get(msg.chat.id);
      if (session) {
        await addVideoToSession(msg, session);
      } else {
        await showVideoChoiceMenu(msg);
      }
    } else {
      await botInstance!.sendMessage(
        msg.chat.id,
        "🎬 الرجاء إرسال ملف *فيديو*!",
        { parse_mode: "Markdown" }
      );
    }
  });

  botInstance.on("message", async (msg) => {
    if (msg.video || msg.document) return;
    if (!msg.text) return;
    const chatId = msg.chat.id;
    trackChat(chatId);
    const text = msg.text.trim();
    if (text.startsWith("/")) return;

    // ── معالجة اختيار الفيديو (1 / 2 / 3) ───────────────────────
    if (pendingVideoChoices.has(chatId)) {
      const pendingMsg = pendingVideoChoices.get(chatId)!;
      if (text === "1") {
        pendingVideoChoices.delete(chatId);
        await botInstance!.sendMessage(chatId, "📡 *جاري النشر على القنوات...*", { parse_mode: "Markdown" });
        await handlePublish(chatId, getSettings());
        return;
      }
      if (text === "2") {
        pendingVideoChoices.delete(chatId);
        await handleVideo(pendingMsg, getSettings());
        return;
      }
      if (text === "3" || text === "إلغاء" || text === "الغ" || text === "cancel") {
        pendingVideoChoices.delete(chatId);
        await botInstance!.sendMessage(chatId, "✅ تم الإلغاء. يمكنك إرسال فيديو جديد في أي وقت.");
        return;
      }
      // أي نص آخر وهناك انتظار — ذكّر المستخدم
      await botInstance!.sendMessage(
        chatId,
        `📹 *في انتظار اختيارك:*\n\n*1️⃣* — نشر مباشرةً على القنوات\n*2️⃣* — إضافة الدعاء على الفيديو\n*3️⃣* — إلغاء\n\n_أرسل 1 أو 2 أو 3_`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ── أمر التوقف ──────────────────────────────────────────────
    if (text === "توقف" || text.includes("توقف") || text === "الغ" || text === "إلغاء" || text === "cancel") {
      if (activeOps.has(chatId)) {
        cancelledChats.add(chatId);
        await botInstance!.sendMessage(
          chatId,
          "⏹ *جاري إيقاف العملية...*\n\nسيتوقف المعالجة في أقرب وقت. ⏳",
          { parse_mode: "Markdown" }
        );
      } else if (chatSessions.has(chatId)) {
        const session = chatSessions.get(chatId)!;
        chatSessions.delete(chatId);
        try { fs.rmSync(session.tmpDir, { recursive: true, force: true }); } catch {}
        await botInstance!.sendMessage(chatId, "✅ تم إلغاء وضع التجميع.", { parse_mode: "Markdown" });
      } else {
        await botInstance!.sendMessage(chatId, "ℹ️ لا توجد عمليات جارية حالياً.", { parse_mode: "Markdown" });
      }
      return;
    }

    // ── أمر الحالة ──────────────────────────────────────────────
    if (text === "حالة" || text.includes("حالة") || text === "status") {
      const op = activeOps.get(chatId);
      const session = chatSessions.get(chatId);
      const allOps = getActiveOps();

      let statusText = `📊 *حالة البوت*\n\n`;
      statusText += `🤖 الفيديوهات المُعالجة: *${processedCount}*\n`;
      statusText += `⚡ العمليات النشطة (كلي): *${allOps.length}*\n\n`;

      if (op) {
        const elapsed = Math.floor((Date.now() - op.startedAt) / 1000);
        statusText += `✅ *عمليتك الحالية:*\n`;
        statusText += `• النوع: ${op.type === "single" ? "فيديو واحد" : "دمج متعدد"}\n`;
        statusText += `• المرحلة: ${op.stage}\n`;
        statusText += `• الوقت المنقضي: *${elapsed}ث*\n\n`;
        statusText += `💡 أرسل *توقف* لإلغاء العملية`;
      } else if (session) {
        statusText += `📋 *وضع التجميع نشط:*\n`;
        statusText += `• الفيديوهات المُجمَّعة: *${session.videos.length}*\n`;
        statusText += `• أرسل *ابدا* للمعالجة أو *توقف* للإلغاء`;
      } else {
        statusText += `✨ *لا توجد عمليات جارية*\n\nأرسل فيديو وأبدأ! 🎬`;
      }

      await botInstance!.sendMessage(chatId, statusText, { parse_mode: "Markdown" });
      return;
    }

    // ── أمر المساعدة ─────────────────────────────────────────────
    const helpKeywords = [
      "مساعدة", "مساعده", "مساعد", "ساعدني", "ساعدني", "ساعد",
      "شرح", "كيف", "كيف أستخدم", "كيف استخدم", "كيفية الاستخدام",
      "تعليمات", "أوامر", "اوامر", "قائمة الأوامر", "ماذا تفعل",
      "ما هي الأوامر", "ما هي اوامرك", "help", "commands", "guide",
    ];
    if (helpKeywords.some(kw => text === kw || text.includes(kw))) {
      const helpText = [
        `📖 *دليل استخدام بوت الدعاء الذكي* 🤲`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `🎬 *كيف يعمل البوت؟*`,
        `أرسل أي فيديو → يعرض عليك خيارين:`,
        `*1️⃣* نشر الفيديو مباشرةً على القنوات`,
        `*2️⃣* إضافة دعاء إسلامي بصوت وتأثيرات`,
        `*3️⃣* إلغاء`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `📋 *الأوامر المتاحة:*`,
        ``,
        `▪️ *مساعدة* — عرض هذه القائمة`,
        `▪️ *حالة* — معرفة العمليات الجارية`,
        `▪️ *توقف* — إيقاف المعالجة الحالية`,
        ``,
        `▪️ *نشر* — نشر آخر فيديو على كل القنوات`,
        `▪️ *انشر على يوتيوب* — نشر على يوتيوب فقط`,
        `▪️ *انشر على فيسبوك* — نشر على فيسبوك فقط`,
        `▪️ *انشر على تيك توك* — نشر على تيك توك فقط`,
        ``,
        `▪️ *ابدا* — بدء وضع دمج عدة فيديوهات`,
        `   _(أرسل فيديوهات مرقمة ثم أرسل ابدا مجدداً)_`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `🤖 *الذكاء الاصطناعي:*`,
        `• يولّد دعاءً إسلامياً مشكّلاً بالكامل`,
        `• يختار بداية عشوائية: اللهم، ربي، يارحيم...`,
        `• يحوّل الدعاء لصوت بشري طبيعي`,
        `• يضع النص المتحرك على الفيديو`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `📡 *النشر التلقائي:*`,
        `• يوتيوب (فيديو عادي + Shorts)`,
        `• فيسبوك`,
        `• تيك توك`,
        `• عنوان وأوسمة SEO بالذكاء الاصطناعي`,
        `• جودة بث احترافية عالية`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `_سبحان الله وبحمده سبحان الله العظيم_ 🤍`,
      ].join("\n");
      await botInstance!.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
      return;
    }

    // ── أمر النشر ───────────────────────────────────────────────
    const publishTriggers = [
      "نشر", "انشر", "أنشر", "نشر الفيديو", "انشر الفيديو",
      "نشر الان", "نشر الآن", "انشر الان", "انشر الآن",
      "ارفع", "أرفع", "ارفع الفيديو", "ارسل الفيديو",
      "نشر المقطع", "انشر المقطع",
      "اريد النشر", "أريد النشر",
      "نشر على المنصات", "انشر على المنصات",
      "نشر على القنوات", "انشر على القنوات", "نشر القنوات",
      "publish", "post", "upload",
    ];
    const isPublishCmd = publishTriggers.some(kw =>
      text === kw || text.startsWith(kw + " ") || text.includes(" " + kw + " ") || text.endsWith(" " + kw)
    );
    if (isPublishCmd) {
      // كشف المنصة المذكورة في الرسالة
      const mentionsYT = /يوتيوب|youtube|yt/i.test(text);
      const mentionsFB = /فيسبوك|فيس بوك|facebook|fb/i.test(text);
      const mentionsTT = /تيك توك|تيك\s*توك|tiktok|tt/i.test(text);

      let filter: PlatformFilter[] | undefined;
      if (mentionsYT || mentionsFB || mentionsTT) {
        filter = [];
        if (mentionsYT) filter.push("youtube");
        if (mentionsFB) filter.push("facebook");
        if (mentionsTT) filter.push("tiktok");
      }

      // ── استخلاص الموضوع من الرسالة ──────────────────────────────
      // يُزيل كلمات الأمر والمنصات وكلمات الربط ليبقى الموضوع
      const stopWords = [
        ...publishTriggers,
        "يوتيوب", "youtube", "yt", "فيسبوك", "فيس بوك", "facebook", "fb",
        "تيك توك", "تيك توك", "tiktok", "tt",
        "على", "في", "و", "الان", "الآن", "القنوات", "المنصات", "الفيديو", "المقطع",
      ];
      let topicText = text;
      for (const w of stopWords) {
        topicText = topicText.replace(new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "gi"), " ");
      }
      const topic = topicText.replace(/\s+/g, " ").trim() || undefined;
      if (topic) addLog(`🎯 موضوع العنوان: "${topic}"`, "info");

      await handlePublish(chatId, getSettings(), filter, topic);
      return;
    }

    // ── أوامر التقارير والتحليل ─────────────────────────────────
    const reportTriggers = ["تقرير", "إحصائيات", "احصائيات", "تقرير اسبوعي", "تقرير أسبوعي", "أداء القناة", "تحليل", "report", "analytics"];
    const isReportCmd = reportTriggers.some(kw => text === kw || text.startsWith(kw));
    if (isReportCmd) {
      try {
        await botInstance!.sendMessage(chatId, "📊 *جاري إعداد التقرير...*", { parse_mode: "Markdown" });
        const summary = getAnalyticsSummary();
        const reportText = buildWeeklyReportText(summary);
        await botInstance!.sendMessage(chatId, reportText, { parse_mode: "Markdown" });
      } catch (err) {
        await botInstance!.sendMessage(chatId, "❌ تعذّر إنشاء التقرير، تأكد من وجود سجل نشر مسبق.");
      }
      return;
    }

    // ── أوامر إدارة القنوات الذكية ───────────────────────────────
    const channelTriggers = ["قنوات", "القنوات", "حالة القنوات", "إحصائيات القنوات", "channels"];
    const isChannelCmd = channelTriggers.some(kw => text === kw || text.startsWith(kw));
    if (isChannelCmd) {
      const settings = getSettings();
      const stats = loadChannelStats();
      if (stats.length === 0) {
        await botInstance!.sendMessage(
          chatId,
          "📡 *لا توجد بيانات قنوات بعد*\n\nأضف معرّفات القنوات من الإعدادات المتقدمة في لوحة التحكم.",
          { parse_mode: "Markdown" }
        );
        return;
      }
      const lines = stats.map(s => {
        const sub = s.subscriberCount !== undefined ? `\n   👥 *${s.subscriberCount.toLocaleString()}* متابع` : "";
        const icon = s.type === "telegram" ? "✈️" : s.type === "youtube" ? "📺" : "📘";
        return `${icon} *${s.channelName}*${sub}`;
      }).join("\n\n");
      const checkedAt = stats[0] ? new Date(stats[0].checkedAt).toLocaleString("ar-EG") : "—";
      await botInstance!.sendMessage(
        chatId,
        `📊 *إحصائيات القنوات المُدارة*\n\n${lines}\n\n━━━━━━━━\n⏱️ آخر تحديث: ${checkedAt}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ── أمر دعاء اليوم ───────────────────────────────────────────
    const duaaTriggers = ["دعاء اليوم", "اعطني دعاء", "أعطني دعاء", "دعاء جديد", "اكتب دعاء", "اكتب لي دعاء", "daily"];
    const isDuaaCmd = duaaTriggers.some(kw => text === kw || text.startsWith(kw));
    if (isDuaaCmd) {
      const waitMsg = await botInstance!.sendMessage(chatId, "🤲 *جاري توليد دعاء اليوم...*", { parse_mode: "Markdown" });
      const content = await generateDailyDuaaContent(geminiKeyStore);
      await botInstance!.editMessageText(
        `🤲 *${content.title}*\n\n${content.duaa}\n\n━━━━━━━━\n_سبحان الله وبحمده سبحان الله العظيم_`,
        { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: "Markdown" }
      ).catch(async () => {
        await botInstance!.sendMessage(chatId, `🤲 *${content.title}*\n\n${content.duaa}`, { parse_mode: "Markdown" });
      });
      return;
    }

    // ── أمر ابدا ────────────────────────────────────────────────
    if (text === "ابدا" || text === "ابدأ" || text.includes("ابدا") || text.includes("ابدأ")) {
      const session = chatSessions.get(chatId);
      if (!session) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-multi-"));
        chatSessions.set(chatId, { state: "collecting", videos: [], tmpDir });
        await botInstance!.sendMessage(
          chatId,
          `✅ *وضع التجميع نشط!*\n\nأرسل الفيديوهات مع الأرقام في وصف كل فيديو:\n• فيديو أول → اكتب *1* في الوصف\n• فيديو ثانٍ → اكتب *2* في الوصف\n• وهكذا...\n\nعندما تنتهي أرسل *ابدا* مرة أخرى للمعالجة 🚀\n\n💡 أرسل *توقف* لإلغاء التجميع`,
          { parse_mode: "Markdown" }
        );
      } else {
        if (session.videos.length === 0) {
          await botInstance!.sendMessage(chatId, "⚠️ لم تُرسل أي فيديوهات بعد! أرسل فيديوهات مرقمة أولاً.");
          return;
        }
        chatSessions.delete(chatId);
        await handleMultiVideo(chatId, session, getSettings());
      }
      return;
    }

    const session = chatSessions.get(chatId);
    if (session) {
      await botInstance!.sendMessage(
        chatId,
        `📹 أرسل فيديوهات مرقمة أو أرسل *ابدا* للمعالجة\n📋 المجمَّع حتى الآن: *${session.videos.length}* فيديو\n\n💡 أرسل *توقف* لإلغاء التجميع`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ── أرقام الاختيار من قائمة "لم أفهم" ───────────────────────
    if (text === "1") {
      await botInstance!.sendMessage(chatId, "🎬 *أرسل الفيديو الآن وسأعالجه!* 👇", { parse_mode: "Markdown" });
      return;
    }
    if (text === "2") {
      await handlePublish(chatId, getSettings());
      return;
    }
    if (text === "3") {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-multi-"));
      chatSessions.set(chatId, { state: "collecting", videos: [], tmpDir });
      await botInstance!.sendMessage(
        chatId,
        `✅ *وضع التجميع نشط!*\n\nأرسل الفيديوهات مع الأرقام في وصف كل فيديو:\n• فيديو أول → اكتب *1* في الوصف\n• فيديو ثانٍ → اكتب *2* في الوصف\n\nعندما تنتهي أرسل *ابدا* للمعالجة 🚀`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    if (text === "4") {
      // Re-use help keywords path — just trigger help directly
      const helpText = [
        `📖 *دليل استخدام بوت الدعاء الذكي* 🤲`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `🎬 *كيف يعمل البوت؟*`,
        `أرسل أي فيديو → يعرض عليك خيارين:`,
        `*1️⃣* نشر الفيديو مباشرةً على القنوات`,
        `*2️⃣* إضافة دعاء إسلامي بصوت وتأثيرات`,
        `*3️⃣* إلغاء`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `📋 *الأوامر المتاحة:*`,
        ``,
        `▪️ *مساعدة* — عرض هذه القائمة`,
        `▪️ *حالة* — معرفة العمليات الجارية`,
        `▪️ *توقف* — إيقاف المعالجة الحالية`,
        ``,
        `▪️ *نشر* — نشر آخر فيديو على كل القنوات`,
        `▪️ *انشر على يوتيوب* — يوتيوب فقط`,
        `▪️ *انشر على فيسبوك* — فيسبوك فقط`,
        `▪️ *انشر على تيك توك* — تيك توك فقط`,
        ``,
        `▪️ *ابدا* — بدء وضع دمج عدة فيديوهات`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `_سبحان الله وبحمده سبحان الله العظيم_ 🤍`,
      ].join("\n");
      await botInstance!.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
      return;
    }

    // ── رد افتراضي: لم أفهم ──────────────────────────────────────
    await botInstance!.sendMessage(
      chatId,
      [
        `🤔 *لم أفهم رسالتك!*`,
        ``,
        `ماذا تريد أن أفعل؟ اختر:`,
        ``,
        `*1️⃣* — إرسال فيديو لإضافة الدعاء عليه`,
        `*2️⃣* — نشر آخر فيديو على القنوات`,
        `*3️⃣* — دمج عدة فيديوهات معاً`,
        `*4️⃣* — مساعدة وشرح الأوامر`,
        ``,
        `_أرسل الرقم أو اكتب أمراً مباشرة_ 👇`,
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [
            [{ text: "نشر" }, { text: "مساعدة" }],
            [{ text: "ابدا" }, { text: "حالة" }],
            [{ text: "توقف" }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }
    );
  });

  botInstance.on("polling_error", (err) => {
    addLog(`خطأ في الاتصال: ${err.message}`, "error");
  });

  return { success: true, message: `تم تشغيل البوت: ${botName}` };
}

export function stopBot() {
  if (!botRunning || !botInstance) {
    return { success: false, message: "البوت غير مُشغَّل" };
  }
  botInstance.stopPolling();
  botInstance = null;
  botRunning = false;
  startTime = null;
  stopScheduler();
  addLog("🔴 تم إيقاف البوت", "warning");
  return { success: true, message: "تم إيقاف البوت بنجاح" };
}

export async function tryAutoStartBot() {
  if (botRunning) return { success: true, message: "البوت يعمل بالفعل" };
  const creds = loadCredentials();
  if (!creds?.botToken || !creds?.geminiKey) {
    addLog("⚠️ لم يتم العثور على مفاتيح محفوظة — يرجى إدخالها من الإعدادات المتقدمة", "warning");
    return { success: false, message: "لا توجد مفاتيح محفوظة" };
  }
  const settings = getSettings();
  addLog("🔄 تشغيل البوت تلقائياً من المفاتيح المحفوظة...", "info");
  return await startBot(creds.geminiKey, creds.botToken, settings, creds.groqKey || "", true);
}

export async function sendWelcomeToAll() {
  if (!botRunning || !botInstance) {
    return { success: false, message: "البوت غير مُشغَّل" };
  }
  const chats = Array.from(knownChatIds);
  if (chats.length === 0) {
    return { success: false, message: "لا توجد محادثات مسجلة بعد" };
  }
  const welcomeText = `🌟 *أهلاً بكم من جديد!*\n\nأنا بوت الدعاء الذكي 🤲\n\n📌 *كيف أعمل:*\n• أرسل فيديو مباشرةً → أضع عليه الدعاء فوراً\n• أو أرسل *ابدا* لدمج عدة مقاطع مرقمة\n\n📋 *أوامر مفيدة:*\n• *حالة* → معرفة العمليات الجارية\n• *توقف* → إيقاف المعالجة الحالية\n• *نشر* → نشر آخر فيديو على منصات التواصل\n\n🎬 *جرّب الآن وأرسل فيديوك!*`;
  let sent = 0;
  for (const chatId of chats) {
    try {
      await botInstance.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
      sent++;
    } catch {}
  }
  addLog(`📢 تم إرسال رسالة الترحيب إلى ${sent} محادثة`, "success");
  return { success: true, message: `تم الإرسال إلى ${sent} محادثة` };
}

async function handleVideo(msg: TelegramBot.Message, settings: AppSettings) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "المستخدم";
  addLog(`📥 استقبال فيديو من: ${userName}`, "info");

  activeOps.set(chatId, { chatId, type: "single", stage: "تحميل الفيديو...", startedAt: Date.now() });
  let statusMsg: TelegramBot.Message | null = null;
  let tmpDir = "";

  try {
    statusMsg = await botInstance!.sendMessage(
      chatId,
      "⏳ *جاري المعالجة...*\n\n📥 تحميل الفيديو...",
      { parse_mode: "Markdown" }
    );

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-"));

    const fileId = msg.video?.file_id || msg.document?.file_id;
    if (!fileId) throw new Error("لم يتم العثور على الفيديو");

    let fileInfo: any;
    try {
      fileInfo = await botInstance!.getFile(fileId);
    } catch (dlErr: any) {
      const isTooBig = String(dlErr?.message || dlErr).toLowerCase().includes("file is too big")
        || String(dlErr?.message || dlErr).includes("413");
      if (isTooBig) {
        throw new Error(
          `⚠️ حجم الفيديو أكبر من 20MB\n\n` +
          `تيليغرام يمنع البوتات من تنزيل ملفات تتجاوز 20MB.\n\n` +
          `*الحل:* اضغط الفيديو قبل إرساله حتى يصبح حجمه أقل من 20MB، ثم أعد الإرسال.`
        );
      }
      throw dlErr;
    }
    const fileUrl = `https://api.telegram.org/file/bot${(botInstance as any).token}/${fileInfo.file_path}`;
    const videoPath = path.join(tmpDir, "input.mp4");

    addLog("📥 تحميل الفيديو...", "processing");
    await downloadFile(fileUrl, videoPath);
    checkCancelled(chatId);

    addLog("📏 قراءة بيانات الفيديو...", "processing");
    const actualDuration = await getVideoDuration(videoPath);
    addLog(`⏱️ مدة الفيديو الحقيقية: ${actualDuration.toFixed(1)}ث`, "info");

    setOpStage(chatId, "توليد الدعاء...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🤖 توليد الدعاء بـ Gemini AI...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🤖 توليد الدعاء بالذكاء الاصطناعي...", "processing");
    const duaaText = await generateDuaa(geminiKeyStore, actualDuration, settings.duaaStyle, groqKeyStore, settings.geminiModel || "auto");
    addLog(`✅ الدعاء: ${duaaText.slice(0, 40)}...`, "success");
    checkCancelled(chatId);

    setOpStage(chatId, "توليد الصوت...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🔊 تحويل الدعاء لصوت...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🔊 تحويل الدعاء لصوت...", "processing");
    const audioPath = path.join(tmpDir, "audio.mp3");
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, actualDuration, resolveVoice(settings.ttsVoice));
    checkCancelled(chatId);

    setOpStage(chatId, "معالجة الفيديو...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🎬 تراكب النص والصوت على الفيديو...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🎬 معالجة الفيديو وتراكب النص...", "processing");
    const outputPath = path.join(tmpDir, "output.mp4");
    await processVideoWithText(videoPath, audioPath, duaaText, outputPath, settings);
    checkCancelled(chatId);

    // Save as last video for publishing
    saveLastVideo(outputPath, duaaText);

    setOpStage(chatId, "إرسال الفيديو...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n📤 إرسال الفيديو النهائي...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("📦 تحضير الفيديو للإرسال...", "processing");
    const sendPath = await ensureUnderTelegramLimit(outputPath, tmpDir);
    addLog("📤 إرسال الفيديو النهائي...", "processing");
    await botInstance!.sendVideo(
      chatId,
      fs.createReadStream(sendPath),
      {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_\n\n💡 أرسل *نشر* لنشر هذا الفيديو على منصات التواصل`,
        parse_mode: "Markdown",
      }
    );

    if (statusMsg) {
      await botInstance!.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    }

    processedCount++;
    addLog(`🎉 تم إرسال الفيديو بنجاح لـ ${userName}`, "success");

    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg === "CANCELLED") {
      addLog(`⏹ تم إلغاء المعالجة لـ ${userName}`, "warning");
      if (statusMsg) {
        await botInstance!.editMessageText(
          "⏹ *تم إلغاء العملية بنجاح.*",
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
        ).catch(() => {});
      } else {
        await botInstance!.sendMessage(chatId, "⏹ تم إلغاء العملية.", { parse_mode: "Markdown" }).catch(() => {});
      }
    } else {
      addLog(`❌ خطأ في المعالجة: ${errorMsg}`, "error");
      if (statusMsg) {
        await botInstance!
          .editMessageText(
            `❌ *حدث خطأ أثناء المعالجة*\n\n\`${errorMsg.slice(0, 200)}\`\n\nالرجاء المحاولة مرة أخرى.`,
            { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
          )
          .catch(() => {});
      }
    }
    if (tmpDir) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  } finally {
    activeOps.delete(chatId);
  }
}

async function addVideoToSession(msg: TelegramBot.Message, session: ChatSession) {
  const chatId = msg.chat.id;
  const caption = (msg.caption || msg.document?.file_name || "").trim();
  const numMatch = caption.match(/\d+/);
  const num = numMatch ? parseInt(numMatch[0]) : session.videos.length + 1;

  const fileId = msg.video?.file_id || msg.document?.file_id;
  if (!fileId) return;

  const existing = session.videos.find(v => v.num === num);
  if (existing) {
    session.videos = session.videos.filter(v => v.num !== num);
    await botInstance!.sendMessage(chatId, `♻️ تم استبدال الفيديو رقم *${num}*`, { parse_mode: "Markdown" });
  }

  session.videos.push({ num, fileId });
  const sorted = [...session.videos].sort((a, b) => a.num - b.num);
  const nums = sorted.map(v => `*${v.num}*`).join(", ");

  await botInstance!.sendMessage(
    chatId,
    `✅ *استُقبل الفيديو رقم ${num}*\n\n📋 المجمَّع: ${nums}\n\nأرسل المزيد أو أرسل *ابدا* للمعالجة`,
    { parse_mode: "Markdown" }
  );
}

// ── Auto-compress video if it exceeds Telegram's 50MB bot upload limit ────────
const TELEGRAM_MAX_BYTES = 49 * 1024 * 1024; // 49 MB safety margin

async function ensureUnderTelegramLimit(filePath: string, tmpDir: string): Promise<string> {
  const stat = fs.statSync(filePath);
  if (stat.size <= TELEGRAM_MAX_BYTES) return filePath;

  const duration = await getVideoDuration(filePath);
  if (duration <= 0) return filePath; // fallback — let Telegram error naturally

  // Target bitrate (kbps) = (targetBytes * 8) / (duration_s * 1000)
  const targetBitrateKbps = Math.floor((TELEGRAM_MAX_BYTES * 8) / (duration * 1000));
  const audioBitrateKbps = 96;
  const videoBitrateKbps = Math.max(300, targetBitrateKbps - audioBitrateKbps);

  const compressedPath = path.join(tmpDir, `compressed_${Date.now()}.mp4`);
  addLog(`📦 ضغط الفيديو: ${(stat.size / 1024 / 1024).toFixed(1)}MB → هدف ${videoBitrateKbps}kbps`, "info");

  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions([
        `-b:v ${videoBitrateKbps}k`,
        `-maxrate ${videoBitrateKbps * 1.5}k`,
        `-bufsize ${videoBitrateKbps * 2}k`,
        `-b:a ${audioBitrateKbps}k`,
        "-c:v libx264",
        "-c:a aac",
        "-preset fast",
        "-movflags +faststart",
      ])
      .save(compressedPath)
      .on("end", () => resolve())
      .on("error", (e: Error) => reject(e));
  });

  const newSize = fs.statSync(compressedPath).size;
  addLog(`✅ الضغط ناجح: ${(newSize / 1024 / 1024).toFixed(1)}MB`, "success");
  return compressedPath;
}

async function handleMultiVideo(chatId: number, session: ChatSession, settings: AppSettings) {
  const { tmpDir, videos } = session;
  const sorted = [...videos].sort((a, b) => a.num - b.num);

  addLog(`🎬 بدء دمج ${sorted.length} فيديوهات`, "processing");

  activeOps.set(chatId, { chatId, type: "multi", stage: "تحميل الفيديوهات...", startedAt: Date.now(), videoCount: sorted.length } as ActiveOp & { videoCount: number });
  let statusMsg: TelegramBot.Message | null = null;
  try {
    statusMsg = await botInstance!.sendMessage(
      chatId,
      `⏳ *جاري المعالجة...*\n\n📥 تحميل ${sorted.length} فيديوهات...`,
      { parse_mode: "Markdown" }
    );

    // 1. Download all videos
    const rawPaths: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      checkCancelled(chatId);
      const v = sorted[i];
      try {
        const fileInfo = await botInstance!.getFile(v.fileId);
        const fileUrl = `https://api.telegram.org/file/bot${(botInstance as any).token}/${fileInfo.file_path}`;
        const vidPath = path.join(tmpDir, `raw_${v.num}.mp4`);
        await downloadFile(fileUrl, vidPath);
        rawPaths.push(vidPath);
        addLog(`✅ تم تحميل الفيديو ${i + 1}/${sorted.length}`, "info");
        setOpStage(chatId, `تحميل ${i + 1}/${sorted.length}...`);
      } catch (dlErr: any) {
        const isTooBig = String(dlErr?.message || dlErr).toLowerCase().includes("file is too big")
          || String(dlErr?.message || dlErr).includes("413");
        if (isTooBig) {
          throw new Error(
            `⚠️ الفيديو رقم *${v.num}* حجمه أكبر من 20MB\n\n` +
            `تيليغرام يمنع البوتات من تنزيل ملفات تتجاوز 20MB.\n\n` +
            `*الحل:* اضغط الفيديو قبل إرساله (مثلاً باستخدام HandBrake أو أي تطبيق ضغط فيديو) حتى يصبح حجمه أقل من 20MB، ثم أعد الإرسال.`
          );
        }
        throw dlErr;
      }
    }
    checkCancelled(chatId);

    const lastRawPath = rawPaths[rawPaths.length - 1];
    const lastDuration = await getVideoDuration(lastRawPath);

    // 2. Generate duaa based on last video duration
    setOpStage(chatId, "توليد الدعاء...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🤖 توليد الدعاء للمقطع الأخير...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    const duaaText = await generateDuaa(geminiKeyStore, lastDuration, settings.duaaStyle, groqKeyStore, settings.geminiModel || "auto");
    addLog(`✅ الدعاء: ${duaaText.slice(0, 40)}...`, "success");
    checkCancelled(chatId);

    // 3. Generate TTS
    setOpStage(chatId, "توليد الصوت...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🔊 توليد صوت الدعاء...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );
    const audioPath = path.join(tmpDir, "audio.mp3");
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, lastDuration, resolveVoice(settings.ttsVoice));
    checkCancelled(chatId);

    // 4. Process last video with duaa overlay
    setOpStage(chatId, "معالجة المقطع الأخير...");
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🎬 معالجة المقطع الأخير بالدعاء...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );
    const lastProcessedPath = path.join(tmpDir, "last_processed.mp4");
    await processVideoWithText(lastRawPath, audioPath, duaaText, lastProcessedPath, settings);
    checkCancelled(chatId);

    // 5. If only one video, send directly
    if (sorted.length === 1) {
      setOpStage(chatId, "إرسال الفيديو...");
      await botInstance!.editMessageText(
        "⏳ *جاري المعالجة...*\n\n📤 إرسال الفيديو...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      saveLastVideo(lastProcessedPath, duaaText);
      const sendPath1 = await ensureUnderTelegramLimit(lastProcessedPath, tmpDir);
      await botInstance!.sendVideo(chatId, fs.createReadStream(sendPath1), {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_\n\n💡 أرسل *نشر* لنشره على منصات التواصل`,
        parse_mode: "Markdown",
      });
    } else {
      // 6. Determine target dimensions from aspect ratio setting (or fallback to source video)
      const aspectRatioMap: Record<string, [number, number]> = {
        "9:16": [1080, 1920],
        "16:9": [1920, 1080],
        "1:1":  [1080, 1080],
        "4:5":  [1080, 1350],
      };
      let refW: number, refH: number;
      const arSetting = settings.aspectRatio || "9:16";
      if (aspectRatioMap[arSetting]) {
        [refW, refH] = aspectRatioMap[arSetting];
      } else {
        [refW, refH] = await Promise.all([getVideoWidth(lastRawPath), getVideoHeight(lastRawPath)]);
      }

      // 7. Normalize non-last videos to same dimensions/fps
      setOpStage(chatId, "توحيد المقاطع...");
      await botInstance!.editMessageText(
        `⏳ *جاري المعالجة...*\n\n🔗 توحيد وضبط ${sorted.length - 1} مقاطع...`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      const segmentPaths: string[] = [];
      for (let i = 0; i < rawPaths.length - 1; i++) {
        checkCancelled(chatId);
        const normPath = path.join(tmpDir, `seg_${i}.mp4`);
        await normalizeVideoSegment(rawPaths[i], normPath, refW, refH, settings);
        segmentPaths.push(normPath);
      }
      segmentPaths.push(lastProcessedPath);
      checkCancelled(chatId);

      // 8. Concat all segments with transitions
      setOpStage(chatId, "دمج المقاطع...");
      await botInstance!.editMessageText(
        "⏳ *جاري المعالجة...*\n\n🎞️ دمج المقاطع بمؤثرات الانتقال...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      const finalPath = path.join(tmpDir, "final.mp4");
      await concatVideosWithTransition(segmentPaths, finalPath, settings.transitionEffect || "random", settings.transitionDuration ?? 0.5);
      checkCancelled(chatId);

      setOpStage(chatId, "إرسال الفيديو النهائي...");
      await botInstance!.editMessageText(
        "⏳ *جاري المعالجة...*\n\n📦 تحضير الفيديو للإرسال...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      saveLastVideo(finalPath, duaaText);
      const sendPath2 = await ensureUnderTelegramLimit(finalPath, tmpDir);
      await botInstance!.sendVideo(chatId, fs.createReadStream(sendPath2), {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_\n\n💡 أرسل *نشر* لنشره على منصات التواصل`,
        parse_mode: "Markdown",
      });
    }

    if (statusMsg) await botInstance!.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    processedCount++;
    addLog(`🎉 تم إرسال الفيديو المدموج (${sorted.length} مقاطع) بنجاح`, "success");

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg === "CANCELLED") {
      addLog(`⏹ تم إلغاء دمج الفيديوهات`, "warning");
      if (statusMsg) {
        await botInstance!.editMessageText(
          "⏹ *تم إلغاء العملية بنجاح.*",
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
        ).catch(() => {});
      } else {
        await botInstance!.sendMessage(chatId, "⏹ تم إلغاء العملية.", { parse_mode: "Markdown" }).catch(() => {});
      }
    } else {
      addLog(`❌ خطأ في دمج الفيديوهات: ${errorMsg}`, "error");
      // User-friendly errors start with ⚠️ and contain Markdown formatting
      const isUserFriendly = errorMsg.startsWith("⚠️");
      const displayMsg = isUserFriendly
        ? `❌ *تعذّر المعالجة*\n\n${errorMsg}\n\n_أرسل *ابدا* للمحاولة مجدداً._`
        : `❌ *حدث خطأ أثناء المعالجة*\n\n\`${errorMsg.slice(0, 200)}\`\n\nالرجاء المحاولة مرة أخرى.`;
      if (statusMsg) {
        await botInstance!.editMessageText(
          displayMsg,
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
        ).catch(async () => {
          await botInstance!.sendMessage(chatId, displayMsg, { parse_mode: "Markdown" }).catch(() => {});
        });
      } else {
        await botInstance!.sendMessage(chatId, displayMsg, { parse_mode: "Markdown" }).catch(() => {});
      }
    }
  } finally {
    activeOps.delete(chatId);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function normalizeVideoSegment(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  settings: AppSettings
) {
  let hasAudio = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${inputPath}"`
    );
    hasAudio = stdout.trim().length > 0;
  } catch {}

  const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

  let cmd: string;
  if (hasAudio) {
    cmd = [
      "ffmpeg",
      `-i "${inputPath}"`,
      `-vf "${scaleFilter}"`,
      `-r 30`,
      `-c:v libx264`,
      `-preset ${settings.videoQuality || "fast"}`,
      `-profile:v baseline -level 3.1`,
      `-pix_fmt yuv420p`,
      `-c:a aac -b:a 128k -ar 44100 -ac 2`,
      `-movflags +faststart`,
      `-y "${outputPath}"`,
    ].join(" ");
  } else {
    cmd = [
      "ffmpeg",
      `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"`,
      `-i "${inputPath}"`,
      `-vf "${scaleFilter}"`,
      `-r 30`,
      `-c:v libx264`,
      `-preset ${settings.videoQuality || "fast"}`,
      `-profile:v baseline -level 3.1`,
      `-pix_fmt yuv420p`,
      `-c:a aac -b:a 128k -ar 44100 -ac 2`,
      `-shortest`,
      `-movflags +faststart`,
      `-y "${outputPath}"`,
    ].join(" ");
  }
  await execAsync(cmd, { timeout: 120000 });
}

function pickTransition(effect: string): string {
  const transitions: Record<string, string> = {
    crossfade: "fade",
    slide_left: "slideleft",
    slide_right: "slideright",
    slide_up: "slideup",
    fade_black: "fadeblack",
    zoom: "zoomin",
    wipe: "wipeleft",
  };

  if (effect === "random") {
    const all = Object.values(transitions);
    return all[Math.floor(Math.random() * all.length)];
  }

  return transitions[effect] || "fade";
}

async function concatVideosWithTransition(videoPaths: string[], outputPath: string, transitionEffect: string, transitionDuration = 0.5) {
  const n = videoPaths.length;
  if (n === 1) {
    fs.copyFileSync(videoPaths[0], outputPath);
    return;
  }

  if (transitionEffect === "none") {
    addLog(`🎞️ تأثير الانتقال: بدون انتقال (دمج مباشر)`, "info");
    await concatVideosSimple(videoPaths, outputPath);
    return;
  }

  // Get durations for all segments (needed to calculate xfade offsets)
  const durations: number[] = [];
  for (const vp of videoPaths) {
    durations.push(await getVideoDuration(vp));
  }

  const TRANS_DUR = Math.max(0, Math.min(4, transitionDuration ?? 0.5));

  const inputs = videoPaths.map(p => `-i "${p}"`).join(" ");

  const transition = pickTransition(transitionEffect);
  addLog(`🎞️ تأثير الانتقال: ${transition} | المدة: ${TRANS_DUR}ث`, "info");

  // Pre-normalize each input stream to ensure consistent fps/format before xfade
  let preFilter = "";
  for (let i = 0; i < n; i++) {
    preFilter += `[${i}:v]fps=30,format=yuv420p[vn${i}];`;
    preFilter += `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[an${i}];`;
  }

  // Build xfade video filter chain using pre-normalized streams
  // [vn0][vn1]xfade=transition=fade:duration=0.5:offset=D0-0.5[vtmp1];
  // [vtmp1][vn2]xfade=transition=fade:duration=0.5:offset=D0+D1-1.0[vout];
  let videoFilter = "";
  let audioFilter = "";
  let cumulativeDur = durations[0];
  let prevVideoLabel = "vn0";
  let prevAudioLabel = "an0";

  for (let i = 1; i < n; i++) {
    const offset = Math.max(0.1, cumulativeDur - TRANS_DUR);
    const isLast = i === n - 1;
    const vLabel = isLast ? "[vout]" : `[vtmp${i}]`;
    const aLabel = isLast ? "[aout]" : `[atmp${i}]`;

    videoFilter += `[${prevVideoLabel}][vn${i}]xfade=transition=${transition}:duration=${TRANS_DUR}:offset=${offset.toFixed(3)}${vLabel};`;
    audioFilter += `[${prevAudioLabel}][an${i}]acrossfade=d=${TRANS_DUR}${aLabel};`;

    prevVideoLabel = isLast ? "vout" : `vtmp${i}`;
    prevAudioLabel = isLast ? "aout" : `atmp${i}`;
    cumulativeDur += durations[i] - TRANS_DUR;
  }

  // Remove trailing semicolons from each chain
  videoFilter = videoFilter.replace(/;$/, "");
  audioFilter = audioFilter.replace(/;$/, "");

  // Combine: pre-normalization → xfade chain → acrossfade chain
  const filterComplex = `${preFilter}${videoFilter};${audioFilter}`;

  const cmd = [
    "ffmpeg",
    inputs,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]" -map "[aout]"`,
    `-c:v libx264 -preset fast`,
    `-profile:v baseline -level 3.1`,
    `-pix_fmt yuv420p`,
    `-c:a aac -b:a 128k`,
    `-movflags +faststart`,
    `-y "${outputPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 600000 });
  } catch (err) {
    // Fallback to simple concat if xfade fails (e.g., very short clips)
    addLog(`⚠️ xfade فشل، التبديل للدمج البسيط...`, "warning");
    await concatVideosSimple(videoPaths, outputPath);
  }
}

async function concatVideosSimple(videoPaths: string[], outputPath: string) {
  const n = videoPaths.length;
  const inputs = videoPaths.map(p => `-i "${p}"`).join(" ");
  const filterIn = videoPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
  const filterComplex = `${filterIn}concat=n=${n}:v=1:a=1[vout][aout]`;

  const cmd = [
    "ffmpeg",
    inputs,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]" -map "[aout]"`,
    `-c:v libx264 -preset fast`,
    `-profile:v baseline -level 3.1`,
    `-pix_fmt yuv420p`,
    `-c:a aac -b:a 128k`,
    `-movflags +faststart`,
    `-y "${outputPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 600000 });
}

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`فشل التحميل: ${res.status}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf));
}

/** Fetch available Gemini models that support generateContent, ordered by preference */
export async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const preferredOrder = [
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.0-pro",
    "gemini-pro",
  ];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) return preferredOrder;

    const data = (await res.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
    };

    const available = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace("models/", ""));

    const sorted = [
      ...preferredOrder.filter((m) => available.includes(m)),
      ...available.filter((m) => !preferredOrder.includes(m)),
    ];

    return sorted.length > 0 ? sorted : preferredOrder;
  } catch {
    return preferredOrder;
  }
}

export async function checkGeminiKeyStatus(apiKey: string): Promise<{
  valid: boolean;
  status: "valid" | "invalid" | "quota_exceeded" | "error";
  message: string;
  models?: string[];
}> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, status: "invalid", message: "لم يتم إدخال مفتاح" };
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      const models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      return {
        valid: true,
        status: "valid",
        message: `✅ المفتاح صالح — ${models.length} نموذج متاح`,
        models,
      };
    }
    const errData = (await res.json().catch(() => ({}))) as { error?: { code?: number; status?: string; message?: string } };
    const errStatus = errData?.error?.status || "";
    const errCode = res.status;
    if (errCode === 429 || errStatus === "RESOURCE_EXHAUSTED") {
      return { valid: false, status: "quota_exceeded", message: "⚠️ تم تجاوز حصة الطلبات اليومية" };
    }
    if (errCode === 400 || errCode === 401 || errStatus === "INVALID_ARGUMENT" || errStatus === "UNAUTHENTICATED") {
      return { valid: false, status: "invalid", message: "❌ مفتاح غير صالح أو منتهي" };
    }
    return { valid: false, status: "error", message: `خطأ غير متوقع (${errCode})` };
  } catch {
    return { valid: false, status: "error", message: "تعذّر الاتصال بـ Gemini API" };
  }
}

async function generateDuaaWithGroq(
  groqKey: string,
  minWords: number,
  _maxWords: number,
  opening: typeof DUAA_OPENINGS[number]
): Promise<string> {
  const groq = new Groq({ apiKey: groqKey });
  addLog(`🤖 Groq — البداية: ${opening.label}`, "processing");

  const models = [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "qwen-qwq-32b",
  ];

  const groqPrompt = `أنت عالم بالدعاء الإسلامي. اكتب دعاءً إسلامياً مؤثراً بالعربية الفصحى مع التشكيل الكامل على جميع الحروف.
موضوع الدعاء: ${opening.theme}
عدد الكلمات: بين ${minWords} و${_maxWords} كلمة تماماً.
شرط إلزامي: يبدأ الدعاء بـ «${opening.text}» ويتناسق معها ما بعدها تماماً.
مثال على الأسلوب: ${opening.example}
القاعدة: اكتب فقط نص الدعاء المشكّل — لا مقدمة ولا شرح ولا علامات.`;

  let bestText = "";
  let bestCount = 0;
  let lastErr: unknown;

  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: groqPrompt }],
        temperature: 0.9,
        max_tokens: 400,
      });
      let text = (completion.choices[0]?.message?.content || "").trim();
      text = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join(" ").trim();
      text = text.replace(/^["'«»\-–—*#]+|["'«»\-–—*#]+$/g, "").trim();
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      addLog(`📊 Groq ${model}: ${wordCount} كلمة`, "info");

      if (wordCount >= minWords) {
        addLog(`✅ نجح Groq: ${model}`, "success");
        return text;
      }
      if (wordCount > bestCount) { bestText = text; bestCount = wordCount; }
      addLog(`⚠️ ${model}: ${wordCount} كلمة، التالي...`, "warning");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`⚠️ فشل Groq ${model}: ${msg.slice(0, 60)}`, "warning");
      lastErr = err;
    }
  }

  if (bestCount >= 8 && bestText) {
    addLog(`⚠️ استخدام أفضل نتيجة Groq: ${bestCount} كلمة`, "warning");
    return bestText;
  }

  throw lastErr || new Error("فشلت جميع نماذج Groq");
}

function hasTashkeel(text: string): boolean {
  const arabicLetters = (text.match(/[\u0621-\u063A\u0641-\u064A]/g) || []).length;
  const diacritics = (text.match(/[\u064B-\u065F]/g) || []).length;
  return arabicLetters > 0 && diacritics / arabicLetters >= 0.5;
}

// ── Random duaa opening phrases — each with its matching theme ────────────
const DUAA_OPENINGS = [
  {
    text: "اللَّهُمَّ", label: "اللهم",
    theme: "التضرع والخشوع بين يدي الله وطلب الهداية والتوفيق",
    example: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى",
  },
  {
    text: "رَبِّي", label: "ربي",
    theme: "إفراد الله بالربوبية والتقرب إليه بالتذلل والافتقار التام",
    example: "رَبِّي إِنِّي لِمَا أَنزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ",
  },
  {
    text: "يَا رَبِّ", label: "يارب",
    theme: "الإلحاح في الدعاء والتضرع للرب طالبًا الفرج والنجاة",
    example: "يَا رَبِّ أَغِثْنِي وَارْحَمْنِي وَاهْدِنِي إِلَى صِرَاطِكَ الْمُسْتَقِيمِ",
  },
  {
    text: "يَا رَحِيمُ", label: "يارحيم",
    theme: "طلب الرحمة الواسعة من الرحيم واللجوء إليه من الضيق والهم",
    example: "يَا رَحِيمُ ارْحَمْنِي بِرَحْمَتِكَ الَّتِي وَسِعَتْ كُلَّ شَيْءٍ",
  },
  {
    text: "يَا غَفُورُ", label: "ياغفور",
    theme: "الاعتراف بالذنوب وطلب المغفرة والتوبة من الغفور الستّار",
    example: "يَا غَفُورُ اغْفِرْ لِي ذُنُوبِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ",
  },
  {
    text: "سُبْحَانَكَ رَبِّي", label: "سبحانك ربي",
    theme: "التسبيح والتنزيه لله ثم الانتقال لطلب العافية والرحمة",
    example: "سُبْحَانَكَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
  },
  {
    text: "يَا حَيُّ يَا قَيُّومُ", label: "ياحي ياقيوم",
    theme: "طلب الثبات على الحق والاستغاثة بالحي القيوم الذي لا يموت",
    example: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ أَصْلِحْ لِي شَأْنِي كُلَّهُ",
  },
  {
    text: "يَا كَرِيمُ", label: "ياكريم",
    theme: "طلب العطاء والرزق الحلال والكرم الإلهي الذي لا ينفد",
    example: "يَا كَرِيمُ أَنْتَ الْجَوَادُ الْكَرِيمُ فَأَعْطِنِي مِنْ فَضْلِكَ الْعَمِيمِ",
  },
  {
    text: "يَا تَوَّابُ", label: "ياتواب",
    theme: "التوبة الصادقة والندم والعزم على العودة لله والإصلاح",
    example: "يَا تَوَّابُ تُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ",
  },
  {
    text: "يَا أَرْحَمَ الرَّاحِمِينَ", label: "يا أرحم الراحمين",
    theme: "طلب الشفاء والرحمة في الشدائد من أرحم الراحمين",
    example: "يَا أَرْحَمَ الرَّاحِمِينَ ارْحَمْنِي وَاشْفِنِي وَعَافِنِي مِمَّا ابْتَلَيْتَنِي",
  },
  {
    text: "رَبَّنَا", label: "ربنا",
    theme: "الدعاء الجماعي وطلب الخير في الدنيا والآخرة ودرء الشر",
    example: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
  },
  {
    text: "يَا لَطِيفُ", label: "يالطيف",
    theme: "طلب اللطف الإلهي والتيسير في الأمور الصعبة وكشف الضيق",
    example: "يَا لَطِيفُ الطُفْ بِي فِي أَمْرِي وَيَسِّرْ لِي مَا أَعْسَرَ عَلَيَّ",
  },
  {
    text: "يَا عَفُوُّ", label: "ياعفو",
    theme: "طلب العفو والصفح عن الذنوب والخطايا مع التذلل والانكسار",
    example: "يَا عَفُوُّ إِنَّكَ عَفُوٌّ كَرِيمٌ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي",
  },
  {
    text: "يَا رَزَّاقُ", label: "يارزاق",
    theme: "طلب الرزق الحلال الطيب المبارك من الرزاق الكريم",
    example: "يَا رَزَّاقُ ارْزُقْنِي رِزْقًا حَلَالًا طَيِّبًا وَبَارِكْ لِي فِيمَا أَعْطَيْتَنِي",
  },
  {
    text: "يَا مُجِيبَ الدُّعَاءِ", label: "يا مجيب الدعاء",
    theme: "الدعاء باليقين التام بالإجابة واللجوء لمجيب الدعوات",
    example: "يَا مُجِيبَ الدُّعَاءِ أَجِبْ دُعَائِي وَلَا تَرُدَّنِي خَائِبًا",
  },
];

function pickRandomOpening() {
  return DUAA_OPENINGS[Math.floor(Math.random() * DUAA_OPENINGS.length)];
}

async function generateDuaa(geminiKey: string, videoDuration: number, _style: string, groqKey = "", selectedModel = "auto"): Promise<string> {
  const minWords = 15;
  const maxWords = 20;
  addLog(`📏 طول الفيديو: ${videoDuration.toFixed(1)}ث → دعاء من ${minWords}-${maxWords} كلمة`, "info");

  const opening = pickRandomOpening();
  addLog(`🎲 البداية: ${opening.label} | الموضوع: ${opening.theme.slice(0, 40)}`, "info");

  const prompt = `أنت عالم بالدعاء الإسلامي. اكتب دعاءً إسلامياً مؤثراً بالعربية الفصحى.
موضوع الدعاء: ${opening.theme}
الشروط الصارمة:
١- يجب أن يكون كل حرف مُشَكَّلاً تشكيلاً كاملاً (فتحة، كسرة، ضمة، سكون، تنوين، شدة) بدون أي استثناء.
٢- عدد الكلمات: بين خمس عشرة وعشرين كلمة فقط.
٣- يجب أن يبدأ الدعاء بالعبارة «${opening.text}» مباشرةً — ابدأ بها وانسجم معها في باقي الدعاء ليكون متناسقاً ومؤثراً.
٤- اكتب نص الدعاء المُشَكَّل فقط — لا مقدمة ولا شرح ولا علامات اقتباس.
مثال مرجعي على الأسلوب المطلوب:
${opening.example}
الدعاء المُشَكَّل (يبدأ بـ «${opening.text}»):`;

  const fallbackChain = [
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];
  const geminiModels = (selectedModel && selectedModel !== "auto")
    ? [selectedModel, ...fallbackChain.filter((m) => m !== selectedModel)]
    : fallbackChain;
  if (selectedModel && selectedModel !== "auto") {
    addLog(`🎯 الموديل المختار: ${selectedModel}`, "info");
  }

  const genAI = new GoogleGenerativeAI(geminiKey);
  let bestGeminiText = "";
  let bestGeminiCount = 0;

  for (const modelName of geminiModels) {
    try {
      addLog(`🤖 محاولة: ${modelName}`, "processing");
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 350 },
      });

      const raw = result.response.text().trim();
      const text = raw
        .split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
        .join(" ")
        .replace(/^["'«»\-–—*#]+|["'«»\-–—*#]+$/g, "")
        .trim();

      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      addLog(`📊 ${modelName}: ${wordCount} كلمة`, "info");

      if (wordCount >= minWords) {
        if (!hasTashkeel(text)) {
          addLog(`⚠️ ${modelName}: ناجح (${wordCount} كلمة) لكن التشكيل ناقص، إعادة المحاولة...`, "warning");
          if (wordCount > bestGeminiCount) { bestGeminiText = text; bestGeminiCount = wordCount; }
          continue;
        }
        addLog(`✅ نجح: ${modelName} — ${wordCount} كلمة مشكّلة`, "success");
        return text;
      }
      if (wordCount > bestGeminiCount) { bestGeminiText = text; bestGeminiCount = wordCount; }
      addLog(`⚠️ ${modelName}: ${wordCount} كلمة، التالي...`, "warning");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota");
      const isNotFound = msg.includes("404") || msg.toLowerCase().includes("not found");
      addLog(`⚠️ ${modelName}: ${isQuota ? "تجاوز الحصة" : isNotFound ? "غير موجود" : msg.slice(0, 50)}`, "warning");
      if (!isQuota && !isNotFound) break;
    }
  }

  if (groqKey) {
    addLog("🔄 الانتقال إلى Groq...", "processing");
    try {
      return await generateDuaaWithGroq(groqKey, minWords, maxWords, opening);
    } catch (groqErr) {
      const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      addLog(`❌ فشل Groq: ${msg.slice(0, 60)}`, "error");
    }
  }

  if (bestGeminiCount >= 8 && bestGeminiText) {
    addLog(`⚠️ استخدام أفضل نتيجة متاحة: ${bestGeminiCount} كلمة`, "warning");
    return bestGeminiText;
  }

  throw new Error("فشل توليد الدعاء من جميع النماذج المتاحة.");
}

const ALL_TTS_VOICES = [
  "ar-SA-HamedNeural", "ar-EG-ShakirNeural", "ar-KW-FahedNeural",
  "ar-SA-ZariyahNeural", "ar-EG-SalmaNeural", "ar-AE-FatimaNeural",
  "ar-MA-JamalNeural", "ar-LB-LaylaNeural",
];

function resolveVoice(voiceSetting: string | undefined): string {
  if (!voiceSetting || voiceSetting === "random") {
    return ALL_TTS_VOICES[Math.floor(Math.random() * ALL_TTS_VOICES.length)];
  }
  return voiceSetting;
}

async function generateTTS(text: string, outputPath: string, slow: boolean, videoDuration?: number, voice = "ar-SA-HamedNeural") {
  const rawPath = outputPath.replace(".mp3", "_raw.mp3");

  if (voice && voice !== "gtts") {
    addLog(`🎙️ توليد الصوت بـ Edge TTS: ${voice}`, "processing");
    const txtFile = rawPath + ".txt";
    const pyFile = rawPath + ".py";
    fs.writeFileSync(txtFile, text, "utf8");
    fs.writeFileSync(pyFile, [
      "import asyncio, edge_tts",
      "async def run():",
      `    with open(${JSON.stringify(txtFile)}, encoding='utf-8') as f:`,
      "        txt = f.read()",
      `    rate = ${slow ? "'-10%'" : "'+0%'"}`,
      `    com = edge_tts.Communicate(txt, ${JSON.stringify(voice)}, rate=rate)`,
      `    await com.save(${JSON.stringify(rawPath)})`,
      "asyncio.run(run())",
    ].join("\n"), "utf8");
    try {
      await execAsync(`python3 ${JSON.stringify(pyFile)}`, { timeout: 60000 });
    } finally {
      try { fs.unlinkSync(txtFile); } catch {}
      try { fs.unlinkSync(pyFile); } catch {}
    }
  } else {
    addLog(`🎙️ توليد الصوت بـ gTTS`, "processing");
    const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const speed = slow ? "slow=True" : "slow=False";
    await execAsync(
      `python3 -c "from gtts import gTTS; gTTS(text='${escapedText}', lang='ar', ${speed}).save('${rawPath}')"`
    );
  }

  if (!videoDuration) {
    fs.renameSync(rawPath, outputPath);
    return;
  }

  const audioDuration = await getAudioDuration(rawPath);
  addLog(`🎵 مدة الصوت: ${audioDuration.toFixed(1)}ث | الفيديو: ${videoDuration.toFixed(1)}ث`, "info");

  if (audioDuration <= videoDuration) {
    fs.renameSync(rawPath, outputPath);
    return;
  }

  const ratio = audioDuration / videoDuration;
  addLog(`⚡ تسريع الصوت: ${ratio.toFixed(2)}x لمطابقة الفيديو`, "processing");

  const atempoFilters: string[] = [];
  let remaining = ratio;
  let safety = 0;
  while (remaining > 1.001 && safety++ < 6) {
    const step = Math.min(2.0, remaining);
    atempoFilters.push(`atempo=${step.toFixed(4)}`);
    remaining /= step;
  }

  const filterStr = atempoFilters.join(",");
  await execAsync(
    `ffmpeg -i "${rawPath}" -filter:a "${filterStr}" -y "${outputPath}"`,
    { timeout: 30000 }
  );
  try { fs.unlinkSync(rawPath); } catch {}
  addLog(`✅ تم تعديل سرعة الصوت`, "success");
}

function estimateWordTimings(words: string[], audioDuration: number): { start: number; end: number }[] {
  if (!words.length) return [];
  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
  const timings: { start: number; end: number }[] = [];
  let elapsed = 0;
  for (let i = 0; i < words.length; i++) {
    const proportion = words[i].length / totalChars;
    const duration = proportion * audioDuration;
    timings.push({ start: elapsed, end: elapsed + duration });
    elapsed += duration;
  }
  return timings;
}

async function generateAnimatedTextFrames(params: {
  words: string[];
  wordTimings: { start: number; end: number }[];
  videoWidth: number;
  videoHeight: number;
  fontPath: string;
  fontSize: number;
  strokeWidth: number;
  yRatio: number;
  activeColor: string;
  textColor: string;
  shadowColor: string;
  shadowColorMode: string;
  bgColor: string;
  bgColorMode: string;
  totalDuration: number;
  outputDir: string;
  showBackground: boolean;
  bgOpacity: number;
  wordEffect: string;
}): Promise<string> {
  const scriptPath = path.join(os.tmpdir(), `anim_arabic_${Date.now()}.py`);
  const paramsPath = path.join(os.tmpdir(), `anim_params_${Date.now()}.json`);
  const concatListPath = path.join(params.outputDir, "frames.txt");

  fs.writeFileSync(paramsPath, JSON.stringify(params), "utf8");

  const script = `
import json, sys, os, math, random as _random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import arabic_reshaper
from bidi.algorithm import get_display

with open(${JSON.stringify(paramsPath)}, encoding='utf-8') as f:
    p = json.load(f)

W = p['videoWidth']
H = p['videoHeight']
font_size = p['fontSize']
y_ratio = p['yRatio']
stroke = p['strokeWidth']
output_dir = p['outputDir']
words = p['words']
word_timings = p['wordTimings']
total_duration = p['totalDuration']
active_hex = p['activeColor']
text_hex = p.get('textColor', 'FFFFFF').lstrip('#')
shadow_hex = p.get('shadowColor', '000000').lstrip('#')
shadow_mode = p.get('shadowColorMode', 'fixed')
bg_hex = p.get('bgColor', '3B82F6').lstrip('#')
bg_mode = p.get('bgColorMode', 'fixed')
show_background = p.get('showBackground', True)
bg_opacity_pct = p.get('bgOpacity', 40)
font_path = p['fontPath']
concat_list_path = os.path.join(output_dir, 'frames.txt')

WORD_EFFECTS_LIST = ['fade_smooth','zoom_pop','bounce_spring','slide_up','slide_down','swing_right','glow_pulse','reveal_rtl','typewriter','wave_cascade','matrix_rain','shimmer','spin_in','scramble']
_raw_effect = p.get('wordEffect', 'random')
word_effect = _random.choice(WORD_EFFECTS_LIST) if (_raw_effect == 'random' or not _raw_effect) else _raw_effect
print(f"[word_effect] using: {word_effect}", flush=True)

def hex_to_rgb(h):
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

ACTIVE_RGB = hex_to_rgb(active_hex)
TEXT_RGB = hex_to_rgb(text_hex) if len(text_hex) == 6 else (255, 255, 255)

PALETTE = [
    (255, 215,   0),
    (255, 143, 171),
    (116, 192, 252),
    (105, 219, 124),
    (255, 179,  71),
    (192, 132, 252),
    ( 34, 211, 238),
    (251, 146,  60),
]
SHADOW_RGB = hex_to_rgb(shadow_hex) if (shadow_mode != 'random' and len(shadow_hex) == 6) else _random.choice(PALETTE)
BG_RGB = hex_to_rgb(bg_hex) if (bg_mode != 'random' and len(bg_hex) == 6) else _random.choice(PALETTE)
EVAP_STEPS = 7
EVAP_Y_DRIFT = 22

font = None
fallback_fonts = [
    font_path,
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/bein.ttf",
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/boutros.ttf",
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/dima.ttf",
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/takeaway.ttf",
]
for fp in fallback_fonts:
    if not fp: continue
    try:
        font = ImageFont.truetype(fp, font_size)
        break
    except: continue
if font is None:
    raise RuntimeError("لم يتم العثور على خط عربي!")

dummy_img = Image.new('RGBA', (W, H), (0,0,0,0))
dummy_draw = ImageDraw.Draw(dummy_img)

lines = []
current_line = []
for word in words:
    test = ' '.join(current_line + [word])
    reshaped_test = get_display(arabic_reshaper.reshape(test))
    bbox = dummy_draw.textbbox((0,0), reshaped_test, font=font)
    if bbox[2] - bbox[0] > W * 0.88 and current_line:
        lines.append(current_line[:])
        current_line = [word]
    else:
        current_line.append(word)
if current_line:
    lines.append(current_line[:])

line_start_indices = []
idx = 0
for line in lines:
    line_start_indices.append(idx)
    idx += len(line)

def get_line_idx(word_idx):
    for i, start in enumerate(line_start_indices):
        if start + len(lines[i]) > word_idx:
            return i
    return len(lines) - 1

def word_w(word):
    r = get_display(arabic_reshaper.reshape(word))
    b = dummy_draw.textbbox((0,0), r, font=font)
    return b[2] - b[0]

def word_h(word):
    r = get_display(arabic_reshaper.reshape(word))
    b = dummy_draw.textbbox((0,0), r, font=font)
    return b[3] - b[1]

LINE_H = max(word_h(w) for w in words) if words else font_size
LINE_SPACING = int(font_size * 0.4)
WORD_GAP = int(font_size * 0.12)

word_colors = {}
for i in range(len(words)):
    word_colors[i] = PALETTE[i % len(PALETTE)]

def draw_word_at(draw, word, x, y, rgb, opacity, stroke_w):
    if opacity <= 0: return
    opacity = max(0, min(255, int(opacity)))
    r = get_display(arabic_reshaper.reshape(word))
    stroke_a = int(210 * opacity / 255)
    if shadow_mode != 'none':
        sha1 = int(200 * opacity / 255)
        sha2 = int(140 * opacity / 255)
        sha3 = int(80 * opacity / 255)
        draw.text((x+6, y+6), r, font=font, fill=(SHADOW_RGB[0], SHADOW_RGB[1], SHADOW_RGB[2], sha1))
        draw.text((x+12, y+12), r, font=font, fill=(SHADOW_RGB[0], SHADOW_RGB[1], SHADOW_RGB[2], sha2))
        draw.text((x+18, y+18), r, font=font, fill=(SHADOW_RGB[0], SHADOW_RGB[1], SHADOW_RGB[2], sha3))
    if stroke_w > 0:
        for dx in range(-stroke_w, stroke_w+1):
            for dy in range(-stroke_w, stroke_w+1):
                if abs(dx)+abs(dy) <= stroke_w:
                    draw.text((x+dx, y+dy), r, font=font, fill=(SHADOW_RGB[0], SHADOW_RGB[1], SHADOW_RGB[2], stroke_a))
    draw.text((x, y), r, font=font, fill=(rgb[0], rgb[1], rgb[2], opacity))

def _draw_entry(img, word, x, y, rgb, base_op, stroke_w, phase):
    """Draw the newly-active word with the chosen entrance animation."""
    eff = word_effect
    if eff == 'none':
        draw_word_at(ImageDraw.Draw(img), word, x, y, rgb, base_op, stroke_w)
        return
    if eff == 'fade_smooth':
        op = int(base_op * min(1.0, phase * 1.8))
        draw_word_at(ImageDraw.Draw(img), word, x, y, rgb, op, stroke_w)

    elif eff == 'slide_up':
        drift = int(font_size * 1.2 * max(0.0, 1.0 - phase * 1.8))
        op = int(base_op * min(1.0, phase * 1.8))
        draw_word_at(ImageDraw.Draw(img), word, x, y + drift, rgb, op, stroke_w)

    elif eff == 'slide_down':
        drift = int(font_size * 1.2 * max(0.0, 1.0 - phase * 1.8))
        op = int(base_op * min(1.0, phase * 1.8))
        draw_word_at(ImageDraw.Draw(img), word, x, y - drift, rgb, op, stroke_w)

    elif eff in ('zoom_pop', 'bounce_spring'):
        ww_val = word_w(word)
        wh_val = LINE_H
        pad = max(12, int(font_size * 0.6))
        tmp = Image.new('RGBA', (ww_val + pad*2, wh_val + pad*2), (0,0,0,0))
        draw_word_at(ImageDraw.Draw(tmp), word, pad, pad, rgb, base_op, stroke_w)
        if eff == 'zoom_pop':
            if phase < 0.55:
                scale = 0.2 + 1.2 * (phase / 0.55)
            else:
                t2 = (phase - 0.55) / 0.45
                scale = 1.4 - 0.4 * t2
        else:
            if phase < 0.12:
                scale = 0.15 + 0.85 * (phase / 0.12)
            else:
                scale = 1.0 + 0.45 * math.sin((phase - 0.12) * math.pi * 2.8) * math.exp(-(phase - 0.12) * 5)
        scale = max(0.05, min(3.0, scale))
        nw = max(1, int(tmp.width * scale))
        nh = max(1, int(tmp.height * scale))
        scaled = tmp.resize((nw, nh), Image.LANCZOS)
        px = x - pad + (ww_val + pad*2 - nw) // 2
        py = y - pad + (wh_val + pad*2 - nh) // 2
        img.paste(scaled, (px, py), scaled)

    elif eff == 'glow_pulse':
        pulse = 0.55 + 0.45 * abs(math.sin(phase * math.pi * 4.5))
        op = int(base_op * min(1.0, phase * 1.8) * pulse)
        draw_word_at(ImageDraw.Draw(img), word, x, y, rgb, op, stroke_w)

    elif eff == 'reveal_rtl':
        ww_val = word_w(word)
        wh_val = LINE_H + int(font_size * 0.45)
        pad = 8
        tmp = Image.new('RGBA', (ww_val + pad*2, wh_val + pad*2), (0,0,0,0))
        draw_word_at(ImageDraw.Draw(tmp), word, pad, pad, rgb, base_op, stroke_w)
        reveal_w = int(tmp.width * min(1.0, phase * 1.4))
        if reveal_w > 0:
            mask = Image.new('L', tmp.size, 0)
            ImageDraw.Draw(mask).rectangle([0, 0, reveal_w, tmp.height], fill=255)
            out = Image.composite(tmp, Image.new('RGBA', tmp.size, (0,0,0,0)), mask)
            img.paste(out, (x - pad, y - pad), out)

    elif eff == 'swing_right':
        drift = int(font_size * 1.4 * max(0.0, 1.0 - phase * 1.6))
        op = int(base_op * min(1.0, phase * 1.6))
        draw_word_at(ImageDraw.Draw(img), word, x - drift, y, rgb, op, stroke_w)

    elif eff == 'typewriter':
        ww_val = word_w(word)
        wh_val = LINE_H + int(font_size * 0.45)
        pad = 6
        tmp = Image.new('RGBA', (ww_val + pad*2, wh_val + pad*2), (0,0,0,0))
        draw_word_at(ImageDraw.Draw(tmp), word, pad, pad, rgb, base_op, stroke_w)
        reveal_w = int(tmp.width * min(1.0, phase * 1.3))
        if reveal_w > 0:
            mask = Image.new('L', tmp.size, 0)
            ImageDraw.Draw(mask).rectangle([tmp.width - reveal_w, 0, tmp.width, tmp.height], fill=255)
            out = Image.composite(tmp, Image.new('RGBA', tmp.size, (0,0,0,0)), mask)
            img.paste(out, (x - pad, y - pad), out)

    elif eff == 'wave_cascade':
        wave = 0.5 + 0.5 * math.sin(phase * math.pi * 3 - math.pi * 0.5)
        scale = 0.4 + 0.8 * wave
        op = int(base_op * min(1.0, phase * 2.0))
        ww_val = word_w(word)
        wh_val = LINE_H
        pad = max(12, int(font_size * 0.6))
        tmp = Image.new('RGBA', (ww_val + pad*2, wh_val + pad*2), (0,0,0,0))
        draw_word_at(ImageDraw.Draw(tmp), word, pad, pad, rgb, op, stroke_w)
        scale = max(0.05, min(2.0, scale))
        nw = max(1, int(tmp.width * scale))
        nh = max(1, int(tmp.height * scale))
        scaled = tmp.resize((nw, nh), Image.LANCZOS)
        px = x - pad + (ww_val + pad*2 - nw) // 2
        py = y - pad + (wh_val + pad*2 - nh) // 2
        img.paste(scaled, (px, py), scaled)

    elif eff == 'matrix_rain':
        drift = int(font_size * 1.5 * max(0.0, 1.0 - phase * 1.6))
        op = int(base_op * min(1.0, phase * 1.6))
        green_shift = max(0, int(80 * (1.0 - phase)))
        tinted_rgb = (max(0, rgb[0] - green_shift), min(255, rgb[1] + green_shift // 2), max(0, rgb[2] - green_shift))
        draw_word_at(ImageDraw.Draw(img), word, x, y - drift, tinted_rgb, op, stroke_w)

    elif eff == 'shimmer':
        brightness = 0.5 + 0.5 * abs(math.sin(phase * math.pi * 3))
        op = int(base_op * min(1.0, phase * 1.8) * brightness)
        draw_word_at(ImageDraw.Draw(img), word, x, y, rgb, op, stroke_w)

    elif eff == 'spin_in':
        ww_val = word_w(word)
        wh_val = LINE_H
        pad = max(12, int(font_size * 0.6))
        tmp = Image.new('RGBA', (ww_val + pad*2, wh_val + pad*2), (0,0,0,0))
        op = int(base_op * min(1.0, phase * 1.5))
        draw_word_at(ImageDraw.Draw(tmp), word, pad, pad, rgb, op, stroke_w)
        spin_scale = 0.1 + 0.9 * min(1.0, phase * 1.5)
        spin_scale = max(0.05, min(1.2, spin_scale))
        nw = max(1, int(tmp.width * spin_scale))
        nh = max(1, int(tmp.height * spin_scale))
        scaled = tmp.resize((nw, nh), Image.LANCZOS)
        if phase < 0.5:
            angle = (1.0 - phase * 2) * 25
            try: scaled = scaled.rotate(angle, expand=False)
            except: pass
        px = x - pad + (ww_val + pad*2 - scaled.width) // 2
        py = y - pad + (wh_val + pad*2 - scaled.height) // 2
        img.paste(scaled, (px, py), scaled)

    elif eff == 'scramble':
        flicker = _random.random() if phase < 0.7 else 1.0
        op = int(base_op * min(1.0, (phase * 1.4 + flicker * 0.3) * 0.85))
        op = min(base_op, max(0, op))
        draw_word_at(ImageDraw.Draw(img), word, x, y, rgb, op, stroke_w)

    else:
        draw_word_at(ImageDraw.Draw(img), word, x, y, rgb, base_op, stroke_w)

def render_frame(active_idx, evap_word_idx, evap_phase):
    img = Image.new('RGBA', (W, H), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cur_line = get_line_idx(max(0, active_idx)) if active_idx >= 0 else 0
    y_center = int(H * y_ratio)

    if show_background and bg_opacity_pct > 0:
        num_visible = 2 if cur_line > 0 else 1
        bar_inner_h = int(num_visible * LINE_H + (num_visible + 1) * LINE_SPACING)
        blur_r = max(4, int(font_size * 0.45))
        bar_total_h = bar_inner_h + blur_r * 4
        bar_alpha = int(bg_opacity_pct * 255 / 100)
        bar_img = Image.new('RGBA', (W, bar_total_h), (0, 0, 0, 0))
        bar_draw = ImageDraw.Draw(bar_img)
        pad = blur_r * 2
        bar_draw.rectangle([0, pad, W, bar_total_h - pad], fill=(0, 0, 0, bar_alpha))
        bar_img = bar_img.filter(ImageFilter.GaussianBlur(blur_r))
        bar_y = y_center - bar_total_h // 2
        img.paste(bar_img, (0, bar_y), bar_img)
        draw = ImageDraw.Draw(img)

    lines_to_show = []
    if cur_line > 0:
        lines_to_show.append((cur_line - 1, y_center - LINE_H - LINE_SPACING, 100))
    lines_to_show.append((cur_line, y_center - LINE_H // 2, 255))

    for li, y_top, base_op in lines_to_show:
        lw_list = lines[li]
        ls = line_start_indices[li]
        widths = [word_w(w) for w in lw_list]
        total_w = sum(widths) + WORD_GAP * max(0, len(lw_list) - 1)
        x = (W + total_w) // 2

        for i, word in enumerate(lw_list):
            g_idx = ls + i
            ww = widths[i]
            x -= ww

            if g_idx == evap_word_idx and evap_phase > 0:
                op = int(base_op * (1.0 - evap_phase))
                y_draw = y_top - int(evap_phase * EVAP_Y_DRIFT)
                rgb = word_colors[g_idx]
                draw_word_at(draw, word, x, y_draw, rgb, op, stroke)
            elif g_idx == active_idx:
                if bg_mode != 'none':
                    hl_pad_x = max(8, int(font_size * 0.18))
                    hl_pad_y = max(4, int(font_size * 0.1))
                    hl_alpha = min(255, int(bg_opacity_pct * 255 / 100))
                    hl_img = Image.new('RGBA', (ww + hl_pad_x * 2 + 20, LINE_H + hl_pad_y * 2 + 20), (0, 0, 0, 0))
                    hl_draw = ImageDraw.Draw(hl_img)
                    hl_draw.rounded_rectangle([10, 10, ww + hl_pad_x * 2 + 10, LINE_H + hl_pad_y * 2 + 10], radius=max(6, int(font_size * 0.14)), fill=(BG_RGB[0], BG_RGB[1], BG_RGB[2], hl_alpha))
                    hl_img = hl_img.filter(ImageFilter.GaussianBlur(max(2, int(font_size * 0.06))))
                    img.paste(hl_img, (x - hl_pad_x - 10, y_top - hl_pad_y - 10), hl_img)
                if evap_phase > 0:
                    _draw_entry(img, word, x, y_top, ACTIVE_RGB, base_op, stroke, evap_phase)
                else:
                    draw_word_at(ImageDraw.Draw(img), word, x, y_top, ACTIVE_RGB, base_op, stroke)
            elif g_idx < active_idx and g_idx != evap_word_idx:
                pass
            else:
                draw_word_at(draw, word, x, y_top, TEXT_RGB, int(base_op * 0.70), stroke)
            x -= WORD_GAP

    return img

os.makedirs(output_dir, exist_ok=True)
frame_entries = []
frame_idx = [0]

def save_frame(img, tag):
    p = os.path.join(output_dir, f'f_{frame_idx[0]:05d}_{tag}.png')
    img.save(p)
    frame_idx[0] += 1
    return p

if word_timings:
    pre_dur = max(0.05, word_timings[0]['start'])
    img = render_frame(-1, -1, 0.0)
    p = save_frame(img, 'pre')
    frame_entries.append((p, pre_dur))

for i in range(len(words)):
    timing = word_timings[i]
    next_start = word_timings[i+1]['start'] if i+1 < len(words) else total_duration
    word_dur = max(0.05, next_start - timing['start'])

    anim_steps = EVAP_STEPS
    sub_dur = word_dur / anim_steps
    evap_idx = i - 1 if i > 0 else -1
    for step in range(anim_steps):
        phase = step / max(1, anim_steps - 1)
        img = render_frame(i, evap_idx, phase)
        p = save_frame(img, f'w{i}_s{step}')
        frame_entries.append((p, sub_dur))

with open(concat_list_path, 'w', encoding='utf-8') as f:
    for path_str, dur in frame_entries:
        f.write(f"file '{path_str}'\\n")
        f.write(f"duration {dur:.4f}\\n")
    if frame_entries:
        f.write(f"file '{frame_entries[-1][0]}'\\n")

print("done")
`;

  fs.writeFileSync(scriptPath, script, "utf8");
  try {
    fs.mkdirSync(params.outputDir, { recursive: true });
    await execAsync(`python3 "${scriptPath}"`, { timeout: 120000 });
    return concatListPath;
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(paramsPath); } catch {}
  }
}

async function processVideoWithText(
  videoPath: string,
  audioPath: string,
  duaaText: string,
  outputPath: string,
  settings: AppSettings
) {
  const [srcW, srcH, videoDuration, audioDuration] = await Promise.all([
    getVideoWidth(videoPath),
    getVideoHeight(videoPath),
    getVideoDuration(videoPath),
    getAudioDuration(audioPath),
  ]);
  const aspectRatioResMap: Record<string, [number, number]> = {
    "9:16": [1080, 1920],
    "16:9": [1920, 1080],
    "1:1":  [1080, 1080],
    "4:5":  [1080, 1350],
  };
  const arKey = settings.aspectRatio || "9:16";
  const [videoW, videoH] = aspectRatioResMap[arKey] ?? [srcW, srcH];
  addLog(`📐 أبعاد المخرج: ${videoW}×${videoH} (${arKey}) | المدة: ${videoDuration.toFixed(1)}ث`, "info");

  const fontPath = getFontPath(settings.font);
  const activeColor = settings.activeColor.replace("#", "");
  const fontSize = settings.fontSize;
  const strokeWidth = settings.strokeThickness;
  const yRatio = settings.yPosition / 100;

  const words = duaaText.split(/\s+/).filter((w) => w.length > 0);
  const wordTimings = estimateWordTimings(words, Math.min(audioDuration, videoDuration));
  addLog(`📝 عدد الكلمات: ${words.length} | الصوت: ${audioDuration.toFixed(1)}ث`, "info");

  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-frames-"));
  addLog(`🎨 توليد إطارات النص المتحرك بتأثير التبخر...`, "processing");
  const concatListPath = await generateAnimatedTextFrames({
    words,
    wordTimings,
    videoWidth: videoW,
    videoHeight: videoH,
    fontPath,
    fontSize,
    strokeWidth,
    yRatio,
    activeColor,
    textColor: settings.textColor || "#FFFFFF",
    shadowColor: settings.shadowColor || "#000000",
    shadowColorMode: settings.shadowColorMode || "fixed",
    bgColor: settings.bgColor || "#3B82F6",
    bgColorMode: settings.bgColorMode || "fixed",
    totalDuration: videoDuration,
    outputDir: framesDir,
    showBackground: settings.showBackground ?? true,
    bgOpacity: settings.bgOpacity ?? 40,
    wordEffect: settings.wordEffect || "random",
  });
  addLog(`✅ تم توليد إطارات التبخر بنجاح`, "success");

  let hasAudio = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`
    );
    hasAudio = stdout.trim().length > 0;
  } catch {}

  let filterComplex: string;
  let audioMap: string;

  const origVol = (settings.muteOriginal ? 0 : (settings.originalVolume ?? 90) / 100).toFixed(3);
  const duaaVol = (settings.muteDuaa    ? 0 : (settings.duaaVolume    ?? 120) / 100).toFixed(3);

  const scaleFilter = `scale=${videoW}:${videoH}:force_original_aspect_ratio=decrease,pad=${videoW}:${videoH}:(ow-iw)/2:(oh-ih)/2`;

  if (hasAudio) {
    filterComplex = [
      `[0:v]${scaleFilter}[scaled]`,
      `[scaled][2:v]overlay=0:0:format=auto[vout]`,
      `[1:a]volume=${duaaVol},apad=whole_dur=${videoDuration}[tts_full]`,
      `[0:a]volume=${origVol}[orig_vol]`,
      `[tts_full][orig_vol]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  } else {
    filterComplex = [
      `[0:v]${scaleFilter}[scaled]`,
      `[scaled][2:v]overlay=0:0:format=auto[vout]`,
      `[1:a]volume=${duaaVol},apad=whole_dur=${videoDuration}[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  }

  const cmd = [
    "ffmpeg",
    `-i "${videoPath}"`,
    `-i "${audioPath}"`,
    `-f concat -safe 0 -i "${concatListPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]"`,
    `-map "${audioMap}"`,
    `-c:v libx264`,
    `-preset ${settings.videoQuality || "fast"}`,
    `-profile:v baseline`,
    `-level 3.1`,
    `-pix_fmt yuv420p`,
    `-c:a aac`,
    `-b:a 128k`,
    `-movflags +faststart`,
    `-t ${videoDuration}`,
    `-y`,
    `"${outputPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 300000 });
  } finally {
    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
  }
}

async function getVideoWidth(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "${videoPath}"`
    );
    return parseInt(stdout.trim()) || 1280;
  } catch {
    return 1280;
  }
}

async function getVideoHeight(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=height -of csv=p=0 "${videoPath}"`
    );
    return parseInt(stdout.trim()) || 720;
  } catch {
    return 720;
  }
}

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`
    );
    return parseFloat(stdout.trim()) || 5;
  } catch {
    return 5;
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`
    );
    return parseFloat(stdout.trim()) || 10;
  } catch {
    return 10;
  }
}

function getFontPath(fontName: string): string {
  const fontsDir = "/home/runner/workspace/artifacts/telegram-bot-studio/fonts";
  const fontMap: Record<string, string> = {
    BeIn:     `${fontsDir}/bein.ttf`,
    Boutros:  `${fontsDir}/boutros.ttf`,
    Dima:     `${fontsDir}/dima.ttf`,
    Takeaway: `${fontsDir}/takeaway.ttf`,
  };

  const p = fontMap[fontName];
  if (p && fs.existsSync(p)) return p;

  const knownFonts = Object.values(fontMap);
  for (const f of knownFonts) {
    if (fs.existsSync(f)) {
      addLog(`⚠️ خط "${fontName}" غير موجود، استخدام بديل: ${path.basename(f)}`, "warning");
      return f;
    }
  }

  addLog(`❌ لم يُعثر على أي خط عربي!`, "error");
  return "";
}

const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

function loadSettingsFromDisk(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return { ...defaultSettings, ...parsed };
    }
  } catch {
    // fall through to defaults
  }
  return { ...defaultSettings };
}

function saveSettingsToDisk(s: AppSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to save settings to disk");
  }
}

let currentSettings: AppSettings = loadSettingsFromDisk();

export function getSettings() {
  return currentSettings;
}

export function updateSettings(settings: Partial<AppSettings>) {
  currentSettings = { ...currentSettings, ...settings };
  saveSettingsToDisk(currentSettings);
  return currentSettings;
}

export async function generateTTSPreview(voice: string, slow: boolean): Promise<string> {
  const sampleText = "اللَّهُمَّ إِنَّا نَسْأَلُكَ رَحْمَتَكَ";
  const tmpPath = path.join(os.tmpdir(), `tts-preview-${Date.now()}.mp3`);
  const rawPath = tmpPath.replace(".mp3", "_raw.mp3");
  const txtFile = rawPath + ".txt";
  const pyFile = rawPath + ".py";
  fs.writeFileSync(txtFile, sampleText, "utf8");
  fs.writeFileSync(pyFile, [
    "import asyncio, edge_tts",
    "async def run():",
    `    with open(${JSON.stringify(txtFile)}, encoding='utf-8') as f:`,
    "        txt = f.read()",
    `    rate = ${slow ? "'-10%'" : "'+0%'"}`,
    `    com = edge_tts.Communicate(txt, ${JSON.stringify(voice)}, rate=rate)`,
    `    await com.save(${JSON.stringify(rawPath)})`,
    "asyncio.run(run())",
  ].join("\n"), "utf8");
  try {
    await execAsync(`python3 ${JSON.stringify(pyFile)}`, { timeout: 30000 });
    fs.renameSync(rawPath, tmpPath);
  } finally {
    try { fs.unlinkSync(txtFile); } catch {}
    try { fs.unlinkSync(pyFile); } catch {}
    try { fs.unlinkSync(rawPath); } catch {}
  }
  return tmpPath;
}
