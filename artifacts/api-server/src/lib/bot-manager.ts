import TelegramBot from "node-telegram-bot-api";
import { GoogleGenerativeAI } from "@google/generative-ai";
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
}

export const defaultSettings: AppSettings = {
  font: "Cairo",
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
};

let botInstance: TelegramBot | null = null;
let botRunning = false;
let botName = "";
let botUsername = "";
let processedCount = 0;
let startTime: number | null = null;
let geminiKeyStore = "";
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

export async function startBot(geminiKey: string, botToken: string, settings: AppSettings) {
  if (botRunning) {
    return { success: false, message: "البوت يعمل بالفعل" };
  }

  const test = await testBotToken(botToken);
  if (!test.success) {
    return { success: false, message: `توكن غير صالح: ${test.error}` };
  }

  geminiKeyStore = geminiKey;
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
    await handleVideo(msg, settings);
  });

  botInstance.on("document", async (msg) => {
    if (msg.document?.mime_type?.startsWith("video/")) {
      await handleVideo(msg, settings);
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

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🤖 توليد الدعاء بـ Gemini AI...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🤖 توليد الدعاء بالذكاء الاصطناعي...", "processing");
    const duration = msg.video?.duration || 10;
    const duaaText = await generateDuaa(geminiKeyStore, duration, settings.duaaStyle);
    addLog(`✅ الدعاء: ${duaaText.slice(0, 40)}...`, "success");

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🔊 تحويل الدعاء لصوت...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🔊 تحويل الدعاء لصوت...", "processing");
    const audioPath = path.join(tmpDir, "audio.mp3");
    await generateTTS(duaaText, audioPath, settings.ttsSpeed);

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
async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const preferredOrder = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
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

async function generateDuaa(geminiKey: string, videoDuration: number, style: string): Promise<string> {
  // Determine word count based on video duration
  // ~2 seconds per word in Arabic TTS
  const maxWords = Math.min(30, Math.max(10, Math.floor(videoDuration / 2)));
  const minWords = Math.max(8, maxWords - 4);
  addLog(`📏 طول الفيديو: ${videoDuration.toFixed(1)}ث → دعاء من ${minWords}-${maxWords} كلمة`, "info");
  const genAI = new GoogleGenerativeAI(geminiKey);

  const styleMap: Record<string, string> = {
    "تضرع وخشوع": "يعبّر عن التضرع والخشوع والانكسار بين يدي الله",
    "شكر وحمد": "يعبّر عن الشكر والحمد والثناء على الله",
    استغفار: "يطلب المغفرة والعفو والرحمة من الله",
    "رجاء وأمل": "يعبّر عن الرجاء والأمل في رحمة الله وفضله",
    "توكل وثقة": "يعبّر عن التوكل على الله والثقة بعطائه",
  };

  const styleDesc = styleMap[style] || styleMap["تضرع وخشوع"];

  const prompt = `اكتب دعاءً إسلامياً باللغة العربية الفصحى مع التشكيل الكامل.

المتطلبات الصارمة:
- عدد الكلمات: من ${minWords} إلى ${maxWords} كلمة بالضبط
- يجب أن يكون ${styleDesc}
- اكتب التشكيل الكامل (فتحة، ضمة، كسرة، شدة، تنوين) على كل حرف
- استخدم كلمات قرآنية ومأثورة
- لا تضع أي شرح أو ترجمة أو علامات ترقيم، فقط الدعاء مباشرة

اكتب الدعاء الآن:`;

  // Fetch models available for this key, then try each until one succeeds
  const models = await getAvailableGeminiModels(geminiKey);
  addLog(`🔍 النماذج المتاحة: ${models.slice(0, 3).join(", ")}...`, "info");

  let lastError: unknown;
  for (const modelName of models) {
    try {
      addLog(`🤖 محاولة النموذج: ${modelName}`, "processing");
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
      });

      let text = result.response.text().trim();
      const lines = text.split("\n").filter((l) => l.trim());
      text = lines[0].trim();
      addLog(`✅ نجح النموذج: ${modelName}`, "success");
      return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("quota");
      const is404 = msg.includes("404") || msg.toLowerCase().includes("not found");
      addLog(`⚠️ فشل ${modelName}: ${is429 ? "تجاوز الحصة" : is404 ? "غير موجود" : msg.slice(0, 60)}`, "warning");
      lastError = err;
      // Only retry on quota/not-found errors; stop on auth errors
      if (!is429 && !is404) break;
    }
  }

  throw new Error(
    `فشلت جميع نماذج Gemini المتاحة. آخر خطأ: ${lastError instanceof Error ? lastError.message.slice(0, 150) : String(lastError)}`
  );
}

async function generateTTS(text: string, outputPath: string, slow: boolean) {
  // Use Python gTTS (already installed in the environment)
  const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const speed = slow ? "slow=True" : "slow=False";
  await execAsync(
    `python3 -c "from gtts import gTTS; gTTS(text='${escapedText}', lang='ar', ${speed}).save('${outputPath}')"`
  );
}

/** Reshape Arabic text using Python arabic_reshaper + bidi for correct ffmpeg rendering */
async function reshapeArabic(text: string): Promise<string> {
  const tmpIn = path.join(os.tmpdir(), `ar_in_${Date.now()}.txt`);
  const tmpOut = path.join(os.tmpdir(), `ar_out_${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpIn, text, "utf8");
    await execAsync(
      `python3 -c "
import arabic_reshaper
from bidi.algorithm import get_display
with open('${tmpIn}', encoding='utf-8') as f:
    t = f.read().strip()
reshaped = get_display(arabic_reshaper.reshape(t))
with open('${tmpOut}', 'w', encoding='utf-8') as f:
    f.write(reshaped)
"`
    );
    const result = fs.readFileSync(tmpOut, "utf8").trim();
    return result || text;
  } catch (e) {
    logger.warn({ e }, "Arabic reshape failed, using raw text");
    return text;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

async function processVideoWithText(
  videoPath: string,
  audioPath: string,
  duaaText: string,
  outputPath: string,
  settings: AppSettings
) {
  // 1. Reshape Arabic text properly for ffmpeg
  const reshapedText = await reshapeArabic(duaaText);
  addLog(`✅ تم تشكيل النص العربي للعرض`, "info");

  // 2. Get dimensions and durations
  const [videoH, videoDuration] = await Promise.all([
    getVideoHeight(videoPath),
    getVideoDuration(videoPath),
  ]);

  const yPixel = Math.floor((settings.yPosition / 100) * videoH);
  const fontPath = getFontPath(settings.font);
  const textColor = settings.textColor.replace("#", "");
  const fontSize = settings.fontSize;
  const strokeWidth = settings.strokeThickness;

  // 3. Escape text for ffmpeg drawtext (write to file to avoid escaping nightmare)
  const tmpTextFile = path.join(os.tmpdir(), `duaa_${Date.now()}.txt`);
  fs.writeFileSync(tmpTextFile, reshapedText, "utf8");

  const fontFile = fontPath ? `fontfile='${fontPath}':` : "";

  const safeTextFilter = [
    `drawtext=${fontFile}textfile='${tmpTextFile}':fontsize=${fontSize}:fontcolor=black@0.8:x=(w-text_w)/2+2:y=${yPixel}+2:borderw=0`,
    `drawtext=${fontFile}textfile='${tmpTextFile}':fontsize=${fontSize}:fontcolor=0x${textColor}:bordercolor=black@0.95:borderw=${strokeWidth}:x=(w-text_w)/2:y=${yPixel}`,
  ].join(",");

  // 4. Check if video has its own audio stream
  let hasAudio = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`
    );
    hasAudio = stdout.trim().length > 0;
  } catch {}

  // 5. Build ffmpeg command:
  //    - Keep FULL video duration (no cutting)
  //    - Original audio at 50% volume
  //    - TTS audio at 100% (padded with silence to fill video duration)
  //    - Text overlay for full duration
  let filterComplex: string;
  let audioMap: string;

  if (hasAudio) {
    // Pad TTS audio with silence to full video duration, then mix with original at 50%
    filterComplex = [
      `[0:v]${safeTextFilter}[vout]`,
      `[1:a]apad=whole_dur=${videoDuration}[tts_full]`,
      `[0:a]volume=0.5[orig_vol]`,
      `[tts_full][orig_vol]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  } else {
    // No original audio — just use TTS padded with silence
    filterComplex = [
      `[0:v]${safeTextFilter}[vout]`,
      `[1:a]apad=whole_dur=${videoDuration}[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  }

  const cmd = [
    "ffmpeg",
    `-i "${videoPath}"`,
    `-i "${audioPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]"`,
    `-map "${audioMap}"`,
    `-c:v libx264`,
    `-preset ${settings.videoQuality || "fast"}`,
    `-c:a aac`,
    `-t ${videoDuration}`,   // Keep FULL original video length
    `-y`,
    `"${outputPath}"`,
  ].join(" ");

  try {
    await execAsync(cmd, { timeout: 180000 });
  } finally {
    try { fs.unlinkSync(tmpTextFile); } catch {}
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
  const fontMap: Record<string, string> = {
    BeIn: "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/bein.ttf",
    Boutros: "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/boutros.ttf",
    Dima: "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/dima.ttf",
    Takeaway: "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/takeaway.ttf",
  };

  const p = fontMap[fontName];
  if (p && fs.existsSync(p)) return p;

  const fallbacks = [
    "/usr/share/fonts/truetype/arabic",
    "/nix/store",
  ];

  for (const dir of fallbacks) {
    try {
      const result = execSync(`find "${dir}" -name "*.ttf" 2>/dev/null | head -1`, { encoding: "utf8" }).trim();
      if (result) return result;
    } catch {
      continue;
    }
  }

  return "";
}

let currentSettings: AppSettings = { ...defaultSettings };

export function getSettings() {
  return currentSettings;
}

export function updateSettings(settings: Partial<AppSettings>) {
  currentSettings = { ...currentSettings, ...settings };
  return currentSettings;
}
