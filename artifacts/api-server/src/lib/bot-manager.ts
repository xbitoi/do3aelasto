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
  originalVolume: number;  // 0-200 (%)
  duaaVolume: number;      // 0-200 (%)
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

export async function startBot(geminiKey: string, botToken: string, settings: AppSettings, groqKey = "") {
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

  botInstance = new TelegramBot(botToken, { polling: true });
  botRunning = true;

  addLog(`✅ تم تشغيل البوت: ${botName} (@${botUsername})`, "success");

  botInstance.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from?.first_name || "صديقي";
    addLog(`👤 مستخدم جديد: ${name}`, "info");
    await botInstance!.sendMessage(
      chatId,
      `🌟 *أهلاً ${name}!*\n\nأنا بوت الدعاء الذكي 🤲\n\n📌 *كيف أعمل:*\n• أرسل فيديو مباشرةً → أضع عليه الدعاء فوراً\n• أو أرسل *ابدا* لدمج عدة مقاطع مرقمة\n\n🎬 *جرّب الآن!*`,
      { parse_mode: "Markdown" }
    );
  });

  botInstance.onText(/\/help/, async (msg) => {
    await botInstance!.sendMessage(
      msg.chat.id,
      `📖 *مساعدة - بوت الدعاء الذكي*\n\n*فيديو مباشر:*\nأرسل فيديو واحد → يُعالج فوراً\n\n*دمج متعدد:*\n1️⃣ أرسل *ابدا*\n2️⃣ أرسل الفيديوهات مع أرقام في الوصف (1، 2، 3...)\n3️⃣ أرسل *ابدا* → يدمجها والدعاء يظهر على المقطع الأخير\n\n/start - بدء التشغيل`,
      { parse_mode: "Markdown" }
    );
  });

  botInstance.on("video", async (msg) => {
    const session = chatSessions.get(msg.chat.id);
    if (session) {
      await addVideoToSession(msg, session);
    } else {
      await handleVideo(msg, getSettings());
    }
  });

  botInstance.on("document", async (msg) => {
    if (msg.document?.mime_type?.startsWith("video/")) {
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
    const text = msg.text.trim();
    if (text.startsWith("/")) return;

    if (text === "ابدا" || text === "ابدأ") {
      const session = chatSessions.get(chatId);
      if (!session) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-multi-"));
        chatSessions.set(chatId, { state: "collecting", videos: [], tmpDir });
        await botInstance!.sendMessage(
          chatId,
          `✅ *وضع التجميع نشط!*\n\nأرسل الفيديوهات مع الأرقام في وصف كل فيديو:\n• فيديو أول → اكتب *1* في الوصف\n• فيديو ثانٍ → اكتب *2* في الوصف\n• وهكذا...\n\nعندما تنتهي أرسل *ابدا* مرة أخرى للمعالجة 🚀`,
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
        `📹 أرسل فيديوهات مرقمة أو أرسل *ابدا* للمعالجة\n📋 المجمَّع حتى الآن: *${session.videos.length}* فيديو`,
        { parse_mode: "Markdown" }
      );
    } else {
      await botInstance!.sendMessage(chatId, "🎬 أرسل لي فيديو وسأضع عليه دعاءً بصوت جميل! 🤲");
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

async function handleVideo(msg: TelegramBot.Message, settings: AppSettings) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "المستخدم";
  addLog(`📥 استقبال فيديو من: ${userName}`, "info");

  let statusMsg: TelegramBot.Message | null = null;

  try {
    statusMsg = await botInstance!.sendMessage(
      chatId,
      "⏳ *جاري المعالجة...*\n\n📥 تحميل الفيديو...",
      { parse_mode: "Markdown" }
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-"));

    const fileId = msg.video?.file_id || msg.document?.file_id;
    if (!fileId) throw new Error("لم يتم العثور على الفيديو");

    const fileInfo = await botInstance!.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${(botInstance as any).token}/${fileInfo.file_path}`;
    const videoPath = path.join(tmpDir, "input.mp4");

    addLog("📥 تحميل الفيديو...", "processing");
    await downloadFile(fileUrl, videoPath);

    // قراءة المدة الحقيقية من الملف بدلاً من بيانات تيليغرام
    addLog("📏 قراءة بيانات الفيديو...", "processing");
    const actualDuration = await getVideoDuration(videoPath);
    addLog(`⏱️ مدة الفيديو الحقيقية: ${actualDuration.toFixed(1)}ث`, "info");

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🤖 توليد الدعاء بـ Gemini AI...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🤖 توليد الدعاء بالذكاء الاصطناعي...", "processing");
    const duaaText = await generateDuaa(geminiKeyStore, actualDuration, settings.duaaStyle, groqKeyStore, settings.geminiModel || "auto");
    addLog(`✅ الدعاء: ${duaaText.slice(0, 40)}...`, "success");

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🔊 تحويل الدعاء لصوت...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🔊 تحويل الدعاء لصوت...", "processing");
    const audioPath = path.join(tmpDir, "audio.mp3");
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, actualDuration, settings.ttsVoice || "ar-SA-HamedNeural");

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🎬 تراكب النص والصوت على الفيديو...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🎬 معالجة الفيديو وتراكب النص...", "processing");
    const outputPath = path.join(tmpDir, "output.mp4");
    await processVideoWithText(videoPath, audioPath, duaaText, outputPath, settings);

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n📤 إرسال الفيديو النهائي...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("📤 إرسال الفيديو النهائي...", "processing");
    await botInstance!.sendVideo(
      chatId,
      fs.createReadStream(outputPath),
      {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_`,
        parse_mode: "Markdown",
      }
    );

    if (statusMsg) {
      await botInstance!.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    }

    processedCount++;
    addLog(`🎉 تم إرسال الفيديو بنجاح لـ ${userName}`, "success");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
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
      const v = sorted[i];
      const fileInfo = await botInstance!.getFile(v.fileId);
      const fileUrl = `https://api.telegram.org/file/bot${(botInstance as any).token}/${fileInfo.file_path}`;
      const vidPath = path.join(tmpDir, `raw_${v.num}.mp4`);
      await downloadFile(fileUrl, vidPath);
      rawPaths.push(vidPath);
      addLog(`✅ تم تحميل الفيديو ${i + 1}/${sorted.length}`, "info");
    }

    const lastRawPath = rawPaths[rawPaths.length - 1];
    const lastDuration = await getVideoDuration(lastRawPath);

    // 2. Generate duaa based on last video duration
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🤖 توليد الدعاء للمقطع الأخير...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );
    const duaaText = await generateDuaa(geminiKeyStore, lastDuration, settings.duaaStyle, groqKeyStore, settings.geminiModel || "auto");
    addLog(`✅ الدعاء: ${duaaText.slice(0, 40)}...`, "success");

    // 3. Generate TTS
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🔊 توليد صوت الدعاء...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );
    const audioPath = path.join(tmpDir, "audio.mp3");
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, lastDuration, settings.ttsVoice || "ar-SA-HamedNeural");

    // 4. Process last video with duaa overlay
    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🎬 معالجة المقطع الأخير بالدعاء...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );
    const lastProcessedPath = path.join(tmpDir, "last_processed.mp4");
    await processVideoWithText(lastRawPath, audioPath, duaaText, lastProcessedPath, settings);

    // 5. If only one video, send directly
    if (sorted.length === 1) {
      await botInstance!.editMessageText(
        "⏳ *جاري المعالجة...*\n\n📤 إرسال الفيديو...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      await botInstance!.sendVideo(chatId, fs.createReadStream(lastProcessedPath), {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_`,
        parse_mode: "Markdown",
      });
    } else {
      // 6. Get reference dimensions from last video
      const [refW, refH] = await Promise.all([getVideoWidth(lastRawPath), getVideoHeight(lastRawPath)]);

      // 7. Normalize non-last videos to same dimensions/fps
      await botInstance!.editMessageText(
        `⏳ *جاري المعالجة...*\n\n🔗 توحيد وضبط ${sorted.length - 1} مقاطع...`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      const segmentPaths: string[] = [];
      for (let i = 0; i < rawPaths.length - 1; i++) {
        const normPath = path.join(tmpDir, `seg_${i}.mp4`);
        await normalizeVideoSegment(rawPaths[i], normPath, refW, refH, settings);
        segmentPaths.push(normPath);
      }
      segmentPaths.push(lastProcessedPath);

      // 8. Concat all segments
      await botInstance!.editMessageText(
        "⏳ *جاري المعالجة...*\n\n🎞️ دمج المقاطع...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      const finalPath = path.join(tmpDir, "final.mp4");
      await concatVideos(segmentPaths, finalPath);

      await botInstance!.editMessageText(
        "⏳ *جاري المعالجة...*\n\n📤 إرسال الفيديو النهائي...",
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
      await botInstance!.sendVideo(chatId, fs.createReadStream(finalPath), {
        caption: `🤲 *${duaaText}*\n\n━━━━━━━━━━\n🤖 _توليد بالذكاء الاصطناعي Gemini_`,
        parse_mode: "Markdown",
      });
    }

    if (statusMsg) await botInstance!.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    processedCount++;
    addLog(`🎉 تم إرسال الفيديو المدموج (${sorted.length} مقاطع) بنجاح`, "success");

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    addLog(`❌ خطأ في دمج الفيديوهات: ${errorMsg}`, "error");
    if (statusMsg) {
      await botInstance!.editMessageText(
        `❌ *حدث خطأ أثناء المعالجة*\n\n\`${errorMsg.slice(0, 200)}\`\n\nالرجاء المحاولة مرة أخرى.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      ).catch(() => {});
    }
  } finally {
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

async function concatVideos(videoPaths: string[], outputPath: string) {
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

    // Sort by our preference order; put unknown models last
    const sorted = [
      ...preferredOrder.filter((m) => available.includes(m)),
      ...available.filter((m) => !preferredOrder.includes(m)),
    ];

    return sorted.length > 0 ? sorted : preferredOrder;
  } catch {
    return preferredOrder;
  }
}

async function generateDuaaWithGroq(groqKey: string, minWords: number, _maxWords: number, randomTheme: string): Promise<string> {
  const groq = new Groq({ apiKey: groqKey });
  addLog("🤖 محاولة Groq...", "processing");

  // Updated working Groq models
  const models = [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "qwen-qwq-32b",
  ];

  // More explicit prompt for Groq
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
      // Keep the best result so far as fallback
      if (wordCount > bestCount) { bestText = text; bestCount = wordCount; }
      addLog(`⚠️ ${model}: ${wordCount} كلمة، التالي...`, "warning");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`⚠️ فشل Groq ${model}: ${msg.slice(0, 60)}`, "warning");
      lastErr = err;
    }
  }

  // Accept best result if at least 8 words rather than failing completely
  if (bestCount >= 8 && bestText) {
    addLog(`⚠️ استخدام أفضل نتيجة Groq: ${bestCount} كلمة`, "warning");
    return bestText;
  }

  throw lastErr || new Error("فشلت جميع نماذج Groq");
}

/** Check if text has sufficient Arabic tashkeel (diacritics) */
function hasTashkeel(text: string): boolean {
  const arabicLetters = (text.match(/[\u0621-\u063A\u0641-\u064A]/g) || []).length;
  const diacritics = (text.match(/[\u064B-\u065F]/g) || []).length;
  return arabicLetters > 0 && diacritics / arabicLetters >= 0.5;
}

async function generateDuaa(geminiKey: string, videoDuration: number, _style: string, groqKey = "", selectedModel = "auto"): Promise<string> {
  const minWords = 15;
  const maxWords = 20;
  addLog(`📏 طول الفيديو: ${videoDuration.toFixed(1)}ث → دعاء من ${minWords}-${maxWords} كلمة`, "info");

  // Random Islamic theme each time
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

  // Strict tashkeel prompt — every single letter must carry its diacritic mark
  const prompt = `اكتب دعاءً إسلامياً بالعربية الفصحى موضوعه: ${randomTheme}.
شروط صارمة جداً:
١- يجب أن يكون كل حرف في الدعاء مُشَكَّلاً تشكيلاً كاملاً (فتحة أو كسرة أو ضمة أو سكون أو تنوين أو شدة) بدون استثناء.
٢- عدد الكلمات: بين خمس عشرة وعشرين كلمة فقط.
٣- اكتب نص الدعاء المُشَكَّل فقط — لا مقدمة ولا شرح.
مثال على التشكيل الكامل المطلوب:
"اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً"
الدعاء المُشَكَّل:`;

  // Determine which models to try — use selected model first, then fallback chain
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

  // Fallback to Groq
  if (groqKey) {
    addLog("🔄 الانتقال إلى Groq...", "processing");
    try {
      return await generateDuaaWithGroq(groqKey, minWords, maxWords, randomTheme);
    } catch (groqErr) {
      const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      addLog(`❌ فشل Groq: ${msg.slice(0, 60)}`, "error");
    }
  }

  // Last resort: use best Gemini result even if short
  if (bestGeminiCount >= 8 && bestGeminiText) {
    addLog(`⚠️ استخدام أفضل نتيجة متاحة: ${bestGeminiCount} كلمة`, "warning");
    return bestGeminiText;
  }

  throw new Error("فشل توليد الدعاء من جميع النماذج المتاحة.");
}

async function generateTTS(text: string, outputPath: string, slow: boolean, videoDuration?: number, voice = "ar-SA-HamedNeural") {
  const rawPath = outputPath.replace(".mp3", "_raw.mp3");

  // Use edge-tts when a Neural voice is selected, fall back to gTTS for "gtts"
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
    // gTTS fallback
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

  // Measure actual audio duration
  const audioDuration = await getAudioDuration(rawPath);
  addLog(`🎵 مدة الصوت: ${audioDuration.toFixed(1)}ث | الفيديو: ${videoDuration.toFixed(1)}ث`, "info");

  if (audioDuration <= videoDuration) {
    // Audio fits — use as-is
    fs.renameSync(rawPath, outputPath);
    return;
  }

  // Audio longer than video — speed it up with atempo filter
  const ratio = audioDuration / videoDuration;
  addLog(`⚡ تسريع الصوت: ${ratio.toFixed(2)}x لمطابقة الفيديو`, "processing");

  // Build atempo chain (each step between 0.5 and 2.0)
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

/** Estimate per-word timings proportionally by character count */
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

/**
 * Generate animated text overlay frames with evaporation effect.
 * Returns a ffmpeg concat-list file path. Each PNG frame has a specific duration.
 * Spoken words evaporate (fade + drift up) as the next word is spoken.
 */
async function generateAnimatedTextFrames(params: {
  words: string[];
  wordTimings: { start: number; end: number }[];
  videoWidth: number;
  videoHeight: number;
  fontPath: string;
  fontSize: number;
  strokeWidth: number;
  yRatio: number;
  activeColor: string;  // hex "RRGGBB"
  totalDuration: number;
  outputDir: string;
}): Promise<string> {  // returns concat-list path
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

# Harmonious color palette for spoken words
PALETTE = [
    (255, 215,   0),  # Gold
    (255, 143, 171),  # Rose
    (116, 192, 252),  # Sky Blue
    (105, 219, 124),  # Mint
    (255, 179,  71),  # Peach
    (192, 132, 252),  # Lavender
    ( 34, 211, 238),  # Aqua
    (251, 146,  60),  # Coral
]
EVAP_STEPS = 7        # sub-frames for evaporation animation
EVAP_Y_DRIFT = 22     # pixels word drifts upward while evaporating

# Load font
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

# Word-wrap into lines (88% width)
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

# Assign palette colors upfront
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
    """
    active_idx: word index being spoken now (-1 = before any word)
    evap_word_idx: word index currently evaporating (-1 = none)
    evap_phase: 0.0 = just started evaporating, 1.0 = fully gone
    """
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
        x = (W + total_w) // 2  # RTL: start from right

        for i, word in enumerate(lw_list):
            g_idx = ls + i
            ww = widths[i]
            x -= ww

            if g_idx == evap_word_idx and evap_phase > 0:
                # Evaporating word: fade + drift up
                op = int(base_op * (1.0 - evap_phase))
                y_draw = y_top - int(evap_phase * EVAP_Y_DRIFT)
                rgb = word_colors[g_idx]
                draw_word_at(draw, word, x, y_draw, rgb, op, stroke)
            elif g_idx == active_idx:
                # Currently spoken: bright highlight
                draw_word_at(draw, word, x, y_top, ACTIVE_RGB, base_op, stroke)
            elif g_idx < active_idx and g_idx != evap_word_idx:
                # Previously spoken & fully evaporated — invisible
                pass
            else:
                # Upcoming word: white, slightly dim
                draw_word_at(draw, word, x, y_top, (255,255,255), int(base_op * 0.70), stroke)
            x -= WORD_GAP

    return img

os.makedirs(output_dir, exist_ok=True)
frame_entries = []  # list of (path, duration)
frame_idx = [0]

def save_frame(img, tag):
    p = os.path.join(output_dir, f'f_{frame_idx[0]:05d}_{tag}.png')
    img.save(p)
    frame_idx[0] += 1
    return p

# === Build the frame sequence ===

# Pre-word frame (before first word)
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
        # First word: no evaporation, just active
        img = render_frame(i, -1, 0.0)
        p = save_frame(img, f'w{i}')
        frame_entries.append((p, word_dur))
    else:
        # Split word duration into evaporation sub-frames
        sub_dur = word_dur / EVAP_STEPS
        for step in range(EVAP_STEPS):
            phase = step / (EVAP_STEPS - 1)  # 0.0 to 1.0
            img = render_frame(i, i-1, phase)
            p = save_frame(img, f'w{i}_ev{step}')
            frame_entries.append((p, sub_dur))

# Write ffmpeg concat list
with open(concat_list_path, 'w', encoding='utf-8') as f:
    for path_str, dur in frame_entries:
        f.write(f"file '{path_str}'\\n")
        f.write(f"duration {dur:.4f}\\n")
    # Repeat last frame once to avoid ffmpeg duration issues
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
  // 1. Get video dimensions, duration, and audio duration in parallel
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

  // 2. Estimate word timings based on audio duration
  const words = duaaText.split(/\s+/).filter((w) => w.length > 0);
  const wordTimings = estimateWordTimings(words, Math.min(audioDuration, videoDuration));
  addLog(`📝 عدد الكلمات: ${words.length} | الصوت: ${audioDuration.toFixed(1)}ث`, "info");

  // 3. Generate animated overlay frames (with evaporation effect)
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

  // 4. Check if video has audio
  let hasAudio = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`
    );
    hasAudio = stdout.trim().length > 0;
  } catch {}

  // 5. Build ffmpeg command
  //    Input 0: original video
  //    Input 1: TTS audio
  //    Input 2: overlay animation (from concat list of PNGs)
  //    The concat-list input has alpha transparency; overlay filter handles it automatically.
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

  // Fallback: try any font in the known fonts directory
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
