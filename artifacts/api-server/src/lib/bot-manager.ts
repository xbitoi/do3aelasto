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

async function generateDuaa(geminiKey: string, duration: number, style: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const styleMap: Record<string, string> = {
    "تضرع وخشوع": "يعبّر عن التضرع والخشوع والانكسار بين يدي الله",
    "شكر وحمد": "يعبّر عن الشكر والحمد والثناء على الله",
    استغفار: "يطلب المغفرة والعفو والرحمة من الله",
    "رجاء وأمل": "يعبّر عن الرجاء والأمل في رحمة الله وفضله",
    "توكل وثقة": "يعبّر عن التوكل على الله والثقة بعطائه",
  };

  const styleDesc = styleMap[style] || styleMap["تضرع وخشوع"];

  const prompt = `اكتب دعاءً إسلامياً قصيراً باللغة العربية الفصحى مع التشكيل الكامل.

المتطلبات الصارمة:
- عدد الكلمات: من 12 إلى 15 كلمة بالضبط
- يجب أن يكون ${styleDesc}
- اكتب التشكيل الكامل (فتحة، ضمة، كسرة، شدة، تنوين) على كل حرف
- استخدم كلمات قرآنية ومأثورة
- لا تضع أي شرح أو ترجمة، فقط الدعاء مباشرة

اكتب الدعاء الآن:`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
  });

  let text = result.response.text().trim();
  const lines = text.split("\n").filter((l) => l.trim());
  text = lines[0].trim();

  return text;
}

async function generateTTS(text: string, outputPath: string, slow: boolean) {
  // Use Python gTTS (already installed in the environment)
  const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const speed = slow ? "slow=True" : "slow=False";
  await execAsync(
    `python3 -c "from gtts import gTTS; gTTS(text='${escapedText}', lang='ar', ${speed}).save('${outputPath}')"`
  );
}

async function processVideoWithText(
  videoPath: string,
  audioPath: string,
  duaaText: string,
  outputPath: string,
  settings: AppSettings
) {
  const ffmpegPath = "ffmpeg";

  const videoH = await getVideoHeight(videoPath);
  const yPixel = Math.floor((settings.yPosition / 100) * videoH);

  const fontPath = getFontPath(settings.font);
  const textColor = settings.textColor.replace("#", "");
  const activeColor = settings.activeColor.replace("#", "");

  const fontSize = settings.fontSize;
  const strokeWidth = settings.strokeThickness;

  const reshapedText = duaaText;

  let filterComplex = "";

  const hasBg = settings.showBackground;
  const bgOpacityHex = Math.floor((settings.bgOpacity / 100) * 255)
    .toString(16)
    .padStart(2, "0");

  const escapedText = reshapedText
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

  const fontFile = fontPath ? `fontfile='${fontPath}':` : "";

  const shadowFilter = `drawtext=${fontFile}text='${escapedText}':fontsize=${fontSize}:fontcolor=black@0.7:x=(w-text_w)/2+3:y=${yPixel}+3:borderw=0`;
  const mainFilter = `drawtext=${fontFile}text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${textColor}:bordercolor=black@0.9:borderw=${strokeWidth}:x=(w-text_w)/2:y=${yPixel}`;

  if (hasBg) {
    filterComplex = `[0:v]drawbox=x=(w-text_w-20)/2:y=${yPixel - fontSize / 2 - 10}:w=text_w+20:h=${fontSize + 20}:color=000000${bgOpacityHex}:t=fill,${shadowFilter},${mainFilter}[vout]`;
    filterComplex = `[0:v]${shadowFilter},${mainFilter}[vout]`;
  } else {
    filterComplex = `[0:v]${shadowFilter},${mainFilter}[vout]`;
  }

  const audioDuration = await getAudioDuration(audioPath);
  const videoDuration = await getVideoDuration(videoPath);
  const finalDuration = Math.min(videoDuration, audioDuration + 0.5);

  const cmd = [
    ffmpegPath,
    `-i "${videoPath}"`,
    `-i "${audioPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]"`,
    `-map 1:a`,
    `-c:v libx264`,
    `-preset ${settings.videoQuality || "fast"}`,
    `-c:a aac`,
    `-t ${finalDuration}`,
    `-y`,
    `"${outputPath}"`,
  ].join(" ");

  await execAsync(cmd, { timeout: 120000 });
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
