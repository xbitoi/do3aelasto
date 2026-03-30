import TelegramBot from "node-telegram-bot-api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger.js";

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
  showBackground: boolean;
  geminiModel: string;
  originalVolume: number;
  duaaVolume: number;
  wordEffect: string;
  transitionEffect: string;
  transitionDuration: number;
  // Social media publishing
  youtubeToken: string;
  facebookToken: string;
  tiktokToken: string;
  publishDescription: string;
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
  showBackground: true,
  geminiModel: "auto",
  originalVolume: 90,
  duaaVolume: 120,
  wordEffect: "random",
  transitionEffect: "random",
  transitionDuration: 0.5,
  youtubeToken: "",
  facebookToken: "",
  tiktokToken: "",
  publishDescription: "",
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

function saveCredentials(botToken: string, geminiKey: string, groqKey: string) {
  try {
    fs.writeFileSync(CREDS_FILE, JSON.stringify({ botToken, geminiKey, groqKey }, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to save bot credentials");
  }
}

function loadCredentials(): { botToken: string; geminiKey: string; groqKey: string } | null {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
    }
  } catch {}
  return null;
}

loadKnownChats();

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

export async function testYouTubeToken(token: string): Promise<{ success: boolean; channelName?: string; channelId?: string; subscribers?: string; error?: string }> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `خطأ ${res.status}` };
    }
    const data = await res.json() as { items?: Array<{ snippet: { title: string }; id: string; statistics: { subscriberCount: string } }> };
    const ch = data.items?.[0];
    if (!ch) return { success: false, error: "لم يُعثر على قناة مرتبطة بهذا التوكن" };
    const subs = parseInt(ch.statistics?.subscriberCount || "0");
    const subsStr = subs >= 1000000 ? `${(subs/1000000).toFixed(1)}M` : subs >= 1000 ? `${(subs/1000).toFixed(1)}K` : String(subs);
    return { success: true, channelName: ch.snippet.title, channelId: ch.id, subscribers: subsStr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testFacebookToken(token: string): Promise<{ success: boolean; pageName?: string; pageId?: string; followers?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/me/accounts?fields=name,id,followers_count&access_token=${token}`
    );
    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `خطأ ${res.status}` };
    }
    const data = await res.json() as { data?: Array<{ name: string; id: string; followers_count?: number }> };
    const page = data.data?.[0];
    if (!page) {
      // Try getting user info
      const userRes = await fetch(`https://graph.facebook.com/me?fields=name,id&access_token=${token}`);
      if (userRes.ok) {
        const user = await userRes.json() as { name?: string; id?: string };
        if (user.name) return { success: true, pageName: user.name, pageId: user.id };
      }
      return { success: false, error: "لم يُعثر على صفحة مرتبطة بهذا التوكن" };
    }
    const f = page.followers_count || 0;
    const followersStr = f >= 1000000 ? `${(f/1000000).toFixed(1)}M` : f >= 1000 ? `${(f/1000).toFixed(1)}K` : String(f);
    return { success: true, pageName: page.name, pageId: page.id, followers: followersStr };
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

async function publishToYouTube(videoPath: string, title: string, description: string, token: string): Promise<{ success: boolean; videoId?: string; url?: string; error?: string }> {
  try {
    addLog("📺 رفع الفيديو على يوتيوب...", "processing");
    const videoBuffer = fs.readFileSync(videoPath);
    const videoSize = videoBuffer.length;

    // Step 1: Initialize resumable upload
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(videoSize),
        },
        body: JSON.stringify({
          snippet: { title: title.slice(0, 100), description, defaultLanguage: "ar", tags: ["دعاء", "إسلامي", "قرآن"] },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
        }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `فشل تهيئة الرفع: ${initRes.status}` };
    }

    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) return { success: false, error: "لم يُعثر على رابط الرفع" };

    // Step 2: Upload video
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(videoSize) },
      body: videoBuffer,
    });

    if (!uploadRes.ok && uploadRes.status !== 308) {
      return { success: false, error: `فشل رفع الفيديو: ${uploadRes.status}` };
    }

    const result = await uploadRes.json() as { id?: string };
    const videoId = result.id;
    if (!videoId) return { success: false, error: "لم يُعثر على معرف الفيديو بعد الرفع" };

    return { success: true, videoId, url: `https://youtu.be/${videoId}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function publishToFacebook(videoPath: string, description: string, token: string): Promise<{ success: boolean; videoId?: string; url?: string; pageId?: string; error?: string }> {
  try {
    addLog("📘 نشر الفيديو على فيسبوك...", "processing");

    // Get page ID first
    const pagesRes = await fetch(`https://graph.facebook.com/me/accounts?access_token=${token}`);
    let pageId = "me";
    let pageToken = token;
    if (pagesRes.ok) {
      const pages = await pagesRes.json() as { data?: Array<{ id: string; access_token: string }> };
      if (pages.data?.[0]) {
        pageId = pages.data[0].id;
        pageToken = pages.data[0].access_token || token;
      }
    }

    const videoBuffer = fs.readFileSync(videoPath);
    const formData = new FormData();
    formData.append("description", description);
    formData.append("access_token", pageToken);
    formData.append("source", new Blob([videoBuffer], { type: "video/mp4" }), "video.mp4");

    const res = await fetch(`https://graph.facebook.com/${pageId}/videos`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: err.error?.message || `فشل النشر: ${res.status}` };
    }

    const result = await res.json() as { id?: string };
    const videoId = result.id;
    return { success: true, videoId, url: `https://www.facebook.com/watch/?v=${videoId}`, pageId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function publishToTikTok(videoPath: string, description: string, token: string): Promise<{ success: boolean; publishId?: string; error?: string }> {
  try {
    addLog("🎵 نشر الفيديو على تيك توك...", "processing");
    const videoBuffer = fs.readFileSync(videoPath);
    const videoSize = videoBuffer.length;

    // Step 1: Init upload
    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: description.slice(0, 150),
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

    // Step 2: Upload video
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

    return { success: true, publishId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handlePublish(chatId: number, settings: AppSettings) {
  const last = loadLastVideo();
  if (!last) {
    await botInstance!.sendMessage(
      chatId,
      "⚠️ *لا يوجد فيديو سابق للنشر!*\n\nقم بمعالجة فيديو أولاً ثم أرسل *نشر*.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const hasYT = Boolean(settings.youtubeToken);
  const hasFB = Boolean(settings.facebookToken);
  const hasTT = Boolean(settings.tiktokToken);

  if (!hasYT && !hasFB && !hasTT) {
    await botInstance!.sendMessage(
      chatId,
      "⚠️ *لم تُضف مفاتيح منصات التواصل!*\n\nأضف مفاتيح يوتيوب أو فيسبوك أو تيك توك من لوحة التحكم.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const platforms = [hasYT && "يوتيوب", hasFB && "فيسبوك", hasTT && "تيك توك"].filter(Boolean).join("، ");
  const statusMsg = await botInstance!.sendMessage(
    chatId,
    `📤 *جاري النشر على: ${platforms}...*\n\nيرجى الانتظار...`,
    { parse_mode: "Markdown" }
  );

  const duaaShort = last.duaaText.split(/\s+/).slice(0, 5).join(" ");
  const title = `🤲 ${duaaShort}...`;
  const customDesc = settings.publishDescription?.trim();
  const description = customDesc
    ? `🤲 ${last.duaaText}\n\n━━━━━━━━━━\n${customDesc}`
    : `🤲 ${last.duaaText}`;

  const results: string[] = [];

  if (hasYT) {
    const ytRes = await publishToYouTube(last.videoPath, title, description, settings.youtubeToken);
    if (ytRes.success) {
      results.push(`✅ *يوتيوب:* [مشاهدة الفيديو](${ytRes.url})`);
      addLog(`✅ تم النشر على يوتيوب: ${ytRes.url}`, "success");
    } else {
      results.push(`❌ *يوتيوب:* ${ytRes.error}`);
      addLog(`❌ فشل النشر على يوتيوب: ${ytRes.error}`, "error");
    }
  }

  if (hasFB) {
    const fbRes = await publishToFacebook(last.videoPath, description, settings.facebookToken);
    if (fbRes.success) {
      results.push(`✅ *فيسبوك:* [مشاهدة الفيديو](${fbRes.url})`);
      addLog(`✅ تم النشر على فيسبوك: ${fbRes.url}`, "success");
    } else {
      results.push(`❌ *فيسبوك:* ${fbRes.error}`);
      addLog(`❌ فشل النشر على فيسبوك: ${fbRes.error}`, "error");
    }
  }

  if (hasTT) {
    const ttRes = await publishToTikTok(last.videoPath, description, settings.tiktokToken);
    if (ttRes.success) {
      results.push(`✅ *تيك توك:* تم إرسال الفيديو للمراجعة`);
      addLog(`✅ تم النشر على تيك توك`, "success");
    } else {
      results.push(`❌ *تيك توك:* ${ttRes.error}`);
      addLog(`❌ فشل النشر على تيك توك: ${ttRes.error}`, "error");
    }
  }

  await botInstance!.editMessageText(
    `📊 *نتائج النشر:*\n\n${results.join("\n")}\n\n━━━━━━━━━━\n🤲 _${last.duaaText.slice(0, 80)}_`,
    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
  ).catch(() => {});
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

  botInstance = new TelegramBot(botToken, { polling: true });
  botRunning = true;

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

  botInstance.on("video", async (msg) => {
    trackChat(msg.chat.id);
    const session = chatSessions.get(msg.chat.id);
    if (session) {
      await addVideoToSession(msg, session);
    } else {
      await handleVideo(msg, getSettings());
    }
  });

  botInstance.on("document", async (msg) => {
    if (msg.document?.mime_type?.startsWith("video/")) {
      trackChat(msg.chat.id);
      const session = chatSessions.get(msg.chat.id);
      if (session) {
        await addVideoToSession(msg, session);
      } else {
        await handleVideo(msg, getSettings());
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

    // ── أمر التوقف ──────────────────────────────────────────────
    if (text === "توقف" || text === "الغ" || text === "إلغاء" || text === "cancel") {
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
    if (text === "حالة" || text === "status") {
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

    // ── أمر النشر ───────────────────────────────────────────────
    if (text === "نشر" || text === "publish") {
      await handlePublish(chatId, getSettings());
      return;
    }

    // ── أمر ابدا ────────────────────────────────────────────────
    if (text === "ابدا" || text === "ابدأ") {
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
    } else {
      await botInstance!.sendMessage(chatId, "🎬 أرسل لي فيديو وسأضع عليه دعاءً بصوت جميل! 🤲\n\nأرسل *حالة* لمعرفة وضع البوت.");
    }
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

    const fileInfo = await botInstance!.getFile(fileId);
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
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, actualDuration, settings.ttsVoice || "ar-SA-HamedNeural");
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

    addLog("📤 إرسال الفيديو النهائي...", "processing");
    await botInstance!.sendVideo(
      chatId,
      fs.createReadStream(outputPath),
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
      const fileInfo = await botInstance!.getFile(v.fileId);
      const fileUrl = `https://api.telegram.org/file/bot${(botInstance as any).token}/${fileInfo.file_path}`;
      const vidPath = path.join(tmpDir, `raw_${v.num}.mp4`);
      await downloadFile(fileUrl, vidPath);
      rawPaths.push(vidPath);
      addLog(`✅ تم تحميل الفيديو ${i + 1}/${sorted.length}`, "info");
      setOpStage(chatId, `تحميل ${i + 1}/${sorted.length}...`);
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
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, lastDuration, settings.ttsVoice || "ar-SA-HamedNeural");
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
      await botInstance!.sendVideo(chatId, fs.createReadStream(lastProcessedPath), {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_\n\n💡 أرسل *نشر* لنشره على منصات التواصل`,
        parse_mode: "Markdown",
      });
    } else {
      // 6. Get reference dimensions from last video
      const [refW, refH] = await Promise.all([getVideoWidth(lastRawPath), getVideoHeight(lastRawPath)]);

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
        "⏳ *جاري المعالجة...*\n\n📤 إرسال الفيديو النهائي...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      saveLastVideo(finalPath, duaaText);
      await botInstance!.sendVideo(chatId, fs.createReadStream(finalPath), {
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
      if (statusMsg) {
        await botInstance!.editMessageText(
          `❌ *حدث خطأ أثناء المعالجة*\n\n\`${errorMsg.slice(0, 200)}\`\n\nالرجاء المحاولة مرة أخرى.`,
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
        ).catch(() => {});
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

async function generateDuaaWithGroq(groqKey: string, minWords: number, _maxWords: number, randomTheme: string): Promise<string> {
  const groq = new Groq({ apiKey: groqKey });
  addLog("🤖 محاولة Groq...", "processing");

  const models = [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "qwen-qwq-32b",
  ];

  const groqPrompt = `اكتب دعاءً إسلامياً بالعربية الفصحى مع التشكيل الكامل على جميع الحروف.
موضوع الدعاء: ${randomTheme}
عدد الكلمات: بين ${minWords} و${_maxWords} كلمة تماماً
القاعدة الصارمة: اكتب فقط نص الدعاء العربي المشكّل، لا مقدمة ولا شرح ولا ترجمة.`;

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

async function generateDuaa(geminiKey: string, videoDuration: number, _style: string, groqKey = "", selectedModel = "auto"): Promise<string> {
  const minWords = 15;
  const maxWords = 20;
  addLog(`📏 طول الفيديو: ${videoDuration.toFixed(1)}ث → دعاء من ${minWords}-${maxWords} كلمة`, "info");

  const themes = [
    "استغفار وطلب المغفرة",
    "حمد الله وشكره",
    "التضرع والخشوع",
    "الرجاء في رحمة الله",
    "طلب الهداية والتوفيق",
    "الدعاء بالعافية والصحة",
    "التوكل على الله",
    "طلب البركة في الرزق",
    "الدعاء للوالدين",
    "طلب الثبات على الدين",
  ];
  const randomTheme = themes[Math.floor(Math.random() * themes.length)];
  addLog(`🎲 الأسلوب العشوائي: ${randomTheme}`, "info");

  const prompt = `اكتب دعاءً إسلامياً بالعربية الفصحى موضوعه: ${randomTheme}.
شروط صارمة جداً:
١- يجب أن يكون كل حرف في الدعاء مُشَكَّلاً تشكيلاً كاملاً (فتحة أو كسرة أو ضمة أو سكون أو تنوين أو شدة) بدون استثناء.
٢- عدد الكلمات: بين خمس عشرة وعشرين كلمة فقط.
٣- اكتب نص الدعاء المُشَكَّل فقط — لا مقدمة ولا شرح.
مثال على التشكيل الكامل المطلوب:
"اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً"
الدعاء المُشَكَّل:`;

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
      return await generateDuaaWithGroq(groqKey, minWords, maxWords, randomTheme);
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
  totalDuration: number;
  outputDir: string;
}): Promise<string> {
  const scriptPath = path.join(os.tmpdir(), `anim_arabic_${Date.now()}.py`);
  const paramsPath = path.join(os.tmpdir(), `anim_params_${Date.now()}.json`);
  const concatListPath = path.join(params.outputDir, "frames.txt");

  fs.writeFileSync(paramsPath, JSON.stringify(params), "utf8");

  const script = `
import json, sys, os, math
from PIL import Image, ImageDraw, ImageFont
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
font_path = p['fontPath']
concat_list_path = os.path.join(output_dir, 'frames.txt')

def hex_to_rgb(h):
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

ACTIVE_RGB = hex_to_rgb(active_hex)

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
    shadow_a = int(160 * opacity / 255)
    stroke_a = int(210 * opacity / 255)
    draw.text((x+2, y+2), r, font=font, fill=(0,0,0,shadow_a))
    if stroke_w > 0:
        for dx in range(-stroke_w, stroke_w+1):
            for dy in range(-stroke_w, stroke_w+1):
                if abs(dx)+abs(dy) <= stroke_w:
                    draw.text((x+dx, y+dy), r, font=font, fill=(0,0,0,stroke_a))
    draw.text((x, y), r, font=font, fill=(rgb[0], rgb[1], rgb[2], opacity))

def render_frame(active_idx, evap_word_idx, evap_phase):
    img = Image.new('RGBA', (W, H), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cur_line = get_line_idx(max(0, active_idx)) if active_idx >= 0 else 0
    y_center = int(H * y_ratio)

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
                draw_word_at(draw, word, x, y_top, ACTIVE_RGB, base_op, stroke)
            elif g_idx < active_idx and g_idx != evap_word_idx:
                pass
            else:
                draw_word_at(draw, word, x, y_top, (255,255,255), int(base_op * 0.70), stroke)
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

    if i == 0:
        img = render_frame(i, -1, 0.0)
        p = save_frame(img, f'w{i}')
        frame_entries.append((p, word_dur))
    else:
        sub_dur = word_dur / EVAP_STEPS
        for step in range(EVAP_STEPS):
            phase = step / (EVAP_STEPS - 1)
            img = render_frame(i, i-1, phase)
            p = save_frame(img, f'w{i}_ev{step}')
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
  const [videoW, videoH, videoDuration, audioDuration] = await Promise.all([
    getVideoWidth(videoPath),
    getVideoHeight(videoPath),
    getVideoDuration(videoPath),
    getAudioDuration(audioPath),
  ]);
  addLog(`📐 أبعاد الفيديو: ${videoW}×${videoH} | المدة: ${videoDuration.toFixed(1)}ث`, "info");

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
    totalDuration: videoDuration,
    outputDir: framesDir,
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

  const origVol = ((settings.originalVolume ?? 60) / 100).toFixed(3);
  const duaaVol = ((settings.duaaVolume ?? 120) / 100).toFixed(3);

  if (hasAudio) {
    filterComplex = [
      `[0:v][2:v]overlay=0:0:format=auto[vout]`,
      `[1:a]volume=${duaaVol},apad=whole_dur=${videoDuration}[tts_full]`,
      `[0:a]volume=${origVol}[orig_vol]`,
      `[tts_full][orig_vol]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  } else {
    filterComplex = [
      `[0:v][2:v]overlay=0:0:format=auto[vout]`,
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
