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
  duaaStyle: string;
  videoQuality: string;
  bgOpacity: number;
  showBackground: boolean;
  geminiModel: string;
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
  duaaStyle: "تضرع وخشوع",
  videoQuality: "fast",
  bgOpacity: 40,
  showBackground: true,
  geminiModel: "auto",
};

let botInstance: TelegramBot | null = null;
let botRunning = false;
let botName = "";
let botUsername = "";
let processedCount = 0;
let startTime: number | null = null;
let geminiKeyStore = "";
let groqKeyStore = "";
let logs: LogEntry[] = [];

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
      `🌟 *أهلاً ${name}!*\n\nأنا بوت الدعاء الذكي 🤲\n\n📌 *كيف أعمل:*\n• أرسل لي فيديو (≈10 ثواني)\n• سأولّد دعاءً بالتشكيل بـ Gemini AI\n• سأضع الدعاء على الفيديو مع الصوت\n• سأعيد إرساله إليك مع مزامنة الكلمات!\n\n🎬 *جرّب الآن — أرسل فيديو!*`,
      { parse_mode: "Markdown" }
    );
  });

  botInstance.onText(/\/help/, async (msg) => {
    await botInstance!.sendMessage(
      msg.chat.id,
      `📖 *مساعدة - بوت الدعاء الذكي*\n\n🎬 أرسل فيديو مدته ≈10 ثواني\n🤖 سيولد Gemini دعاءً بالتشكيل\n🔊 يُحوّل الدعاء لصوت عربي\n📝 يُراكَب النص على الفيديو\n💙 الكلمات تُضاء بالتزامن مع الصوت\n\n/start - بدء التشغيل`,
      { parse_mode: "Markdown" }
    );
  });

  botInstance.on("video", async (msg) => {
    await handleVideo(msg, getSettings());
  });

  botInstance.on("document", async (msg) => {
    if (msg.document?.mime_type?.startsWith("video/")) {
      await handleVideo(msg, getSettings());
    } else {
      await botInstance!.sendMessage(
        msg.chat.id,
        "🎬 الرجاء إرسال ملف *فيديو* (مدته ≈10 ثواني) لأقوم بمعالجته!",
        { parse_mode: "Markdown" }
      );
    }
  });

  botInstance.on("message", async (msg) => {
    if (!msg.video && !msg.document && !msg.text?.startsWith("/")) {
      await botInstance!.sendMessage(
        msg.chat.id,
        "🎬 أرسل لي فيديو وسأضع عليه دعاءً بصوت جميل! 🤲"
      );
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
    await generateTTS(duaaText, audioPath, settings.ttsSpeed, actualDuration);

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

  // Explicit prompt with word count examples
  const prompt = `اكتب دعاءً إسلامياً مشكّلاً تشكيلاً كاملاً بالعربية الفصحى، موضوعه: ${randomTheme}.
يجب أن يحتوي الدعاء على خمس عشرة كلمة على الأقل وعشرين كلمة كحد أقصى.
مثال على الطول المطلوب: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالآخِرَةِ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً"
اكتب الدعاء فقط بدون أي مقدمة:`;

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
        addLog(`✅ نجح: ${modelName}`, "success");
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

async function generateTTS(text: string, outputPath: string, slow: boolean, videoDuration?: number) {
  // Generate TTS using gTTS
  const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const speed = slow ? "slow=True" : "slow=False";
  const rawPath = outputPath.replace(".mp3", "_raw.mp3");

  await execAsync(
    `python3 -c "from gtts import gTTS; gTTS(text='${escapedText}', lang='ar', ${speed}).save('${rawPath}')"`
  );

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
 * Generate animated text overlay frames (one PNG per word-active state).
 * Returns list of {pngPath, start, end} for ffmpeg overlay chain.
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
}): Promise<Array<{ pngPath: string; start: number; end: number }>> {
  const scriptPath = path.join(os.tmpdir(), `anim_arabic_${Date.now()}.py`);
  const paramsPath = path.join(os.tmpdir(), `anim_params_${Date.now()}.json`);
  const resultPath = path.join(os.tmpdir(), `anim_result_${Date.now()}.json`);

  fs.writeFileSync(paramsPath, JSON.stringify(params), "utf8");

  const script = `
import json, sys, os
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

def hex_to_rgb(h):
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

ACTIVE_RGB = hex_to_rgb(active_hex)

# Harmonious color palette for spoken words
PALETTE = [
    (255, 215,   0),   # Gold
    (255, 143, 171),   # Rose
    (116, 192, 252),   # Sky Blue
    (105, 219, 124),   # Mint
    (255, 179,  71),   # Peach
    (192, 132, 252),   # Lavender
     (34, 211, 238),   # Aqua
    (251, 146,  60),   # Coral
]

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

# Word-wrap into lines (90% width)
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

# Line start indices in words[]
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

def word_display_width(word):
    reshaped = get_display(arabic_reshaper.reshape(word))
    bbox = dummy_draw.textbbox((0,0), reshaped, font=font)
    return bbox[2] - bbox[0]

def word_display_height(word):
    reshaped = get_display(arabic_reshaper.reshape(word))
    bbox = dummy_draw.textbbox((0,0), reshaped, font=font)
    return bbox[3] - bbox[1]

LINE_H = max(word_display_height(w) for w in words) if words else font_size
LINE_SPACING = int(font_size * 0.4)
WORD_GAP = int(font_size * 0.12)

def draw_word(draw, word, x, y, rgb, opacity, stroke_w):
    reshaped = get_display(arabic_reshaper.reshape(word))
    a = int(opacity)
    shadow_a = int(180 * opacity / 255)
    stroke_a = int(220 * opacity / 255)
    draw.text((x+2, y+2), reshaped, font=font, fill=(0,0,0,shadow_a))
    if stroke_w > 0:
        for dx in range(-stroke_w, stroke_w+1):
            for dy in range(-stroke_w, stroke_w+1):
                if abs(dx)+abs(dy) <= stroke_w:
                    draw.text((x+dx, y+dy), reshaped, font=font, fill=(0,0,0,stroke_a))
    draw.text((x, y), reshaped, font=font, fill=(rgb[0],rgb[1],rgb[2],a))

def render_line(draw, line_words, line_start, active_idx, word_colors, y_top, base_opacity=255):
    widths = [word_display_width(w) for w in line_words]
    total_w = sum(widths) + WORD_GAP * max(0, len(line_words)-1)
    # RTL: word[0] is rightmost — place from right to left
    x = (W + total_w) // 2
    for i, word in enumerate(line_words):
        g_idx = line_start + i
        ww = widths[i]
        x -= ww
        if g_idx == active_idx:
            rgb = ACTIVE_RGB
            op = base_opacity
        elif g_idx < active_idx and g_idx in word_colors:
            rgb = word_colors[g_idx]
            op = base_opacity
        else:
            rgb = (255, 255, 255)
            op = int(base_opacity * 0.75)
        draw_word(draw, word, x, y_top, rgb, op, stroke)
        x -= WORD_GAP

def render_frame(active_word_idx, word_colors):
    img = Image.new('RGBA', (W, H), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    cur_line = get_line_idx(max(0, active_word_idx)) if active_word_idx >= 0 else 0
    y_center = int(H * y_ratio)

    # Determine how many lines to show (current + prev)
    show = []
    if cur_line > 0:
        show.append((cur_line - 1, y_center - LINE_H - LINE_SPACING, 120))
    show.append((cur_line, y_center - LINE_H // 2, 255))

    for li, y_top, opacity in show:
        render_line(draw, lines[li], line_start_indices[li], active_word_idx, word_colors, y_top, opacity)
    return img

os.makedirs(output_dir, exist_ok=True)
frames = []
word_colors = {}
palette_idx = 0

# Pre-first-word frame
img = render_frame(-1, {})
pre_path = os.path.join(output_dir, 'frame_pre.png')
img.save(pre_path)
pre_end = word_timings[0]['start'] if word_timings else total_duration
if pre_end > 0:
    frames.append({'pngPath': pre_path, 'start': 0.0, 'end': pre_end})

# One frame per word
for i in range(len(words)):
    word_colors[i] = PALETTE[palette_idx % len(PALETTE)]
    palette_idx += 1
    img = render_frame(i, word_colors)
    fp = os.path.join(output_dir, f'frame_{i:04d}.png')
    img.save(fp)
    start_t = word_timings[i]['start']
    end_t = word_timings[i+1]['start'] if i+1 < len(words) else total_duration
    end_t = max(end_t, start_t + 0.05)
    frames.append({'pngPath': fp, 'start': start_t, 'end': end_t})

with open(${JSON.stringify(resultPath)}, 'w', encoding='utf-8') as f:
    json.dump(frames, f)
print("done")
`;

  fs.writeFileSync(scriptPath, script, "utf8");
  try {
    await execAsync(`python3 "${scriptPath}"`, { timeout: 60000 });
    const raw = fs.readFileSync(resultPath, "utf8");
    return JSON.parse(raw) as Array<{ pngPath: string; start: number; end: number }>;
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(paramsPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
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

  // 3. Generate animated PNG frames (one per word state)
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "duaa-frames-"));
  addLog(`🎨 توليد إطارات النص المتحرك...`, "processing");
  const frames = await generateAnimatedTextFrames({
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
  addLog(`✅ تم توليد ${frames.length} إطار نصي`, "success");

  // 4. Check if video has audio
  let hasAudio = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`
    );
    hasAudio = stdout.trim().length > 0;
  } catch {}

  // 5. Build ffmpeg command with animated overlay chain
  //    Inputs: 0=video, 1=tts audio, 2..N+1=PNG frames
  //    Each PNG is overlaid for its time window using enable='between(t,start,end)'
  const inputArgs: string[] = [
    `-i "${videoPath}"`,
    `-i "${audioPath}"`,
    ...frames.map((f) => `-i "${f.pngPath}"`),
  ];

  // Build video filter chain: chain overlay for each frame
  const videoFilters: string[] = [];
  let prevLabel = "0:v";
  for (let i = 0; i < frames.length; i++) {
    const inputIdx = i + 2;  // inputs 2..N+1 are the PNGs
    const outLabel = i === frames.length - 1 ? "vout" : `v${i}`;
    const { start, end } = frames[i];
    videoFilters.push(
      `[${prevLabel}][${inputIdx}:v]overlay=0:0:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[${outLabel}]`
    );
    prevLabel = outLabel;
  }

  // If no frames somehow, pass through
  if (frames.length === 0) {
    videoFilters.push(`[0:v]copy[vout]`);
  }

  // Audio filters
  let audioMap: string;
  const audioFilters: string[] = [];
  if (hasAudio) {
    audioFilters.push(`[1:a]apad=whole_dur=${videoDuration}[tts_full]`);
    audioFilters.push(`[0:a]volume=0.5[orig_vol]`);
    audioFilters.push(`[tts_full][orig_vol]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    audioMap = `[aout]`;
  } else {
    audioFilters.push(`[1:a]apad=whole_dur=${videoDuration}[aout]`);
    audioMap = `[aout]`;
  }

  const filterComplex = [...videoFilters, ...audioFilters].join(";");

  const cmd = [
    "ffmpeg",
    ...inputArgs,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]"`,
    `-map "${audioMap}"`,
    `-c:v libx264`,
    `-preset ${settings.videoQuality || "fast"}`,
    `-c:a aac`,
    `-t ${videoDuration}`,
    `-y`,
    `"${outputPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 300000 });
  } finally {
    // Clean up frames directory
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
