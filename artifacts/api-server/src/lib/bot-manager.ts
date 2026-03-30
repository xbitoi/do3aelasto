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

    // قراءة المدة الحقيقية من الملف بدلاً من بيانات تيليغرام
    addLog("📏 قراءة بيانات الفيديو...", "processing");
    const actualDuration = await getVideoDuration(videoPath);
    addLog(`⏱️ مدة الفيديو الحقيقية: ${actualDuration.toFixed(1)}ث`, "info");

    await botInstance!.editMessageText(
      "⏳ *جاري المعالجة...*\n\n🤖 توليد الدعاء بـ Gemini AI...",
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    addLog("🤖 توليد الدعاء بالذكاء الاصطناعي...", "processing");
    const duaaText = await generateDuaa(geminiKeyStore, actualDuration, settings.duaaStyle, groqKeyStore);
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

async function generateDuaaWithGroq(groqKey: string, minWords: number, maxWords: number, styleDesc: string, prompt: string): Promise<string> {
  const groq = new Groq({ apiKey: groqKey });
  addLog("🤖 محاولة Groq (llama-3.3-70b)...", "processing");

  const models = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 600,
      });
      let text = (completion.choices[0]?.message?.content || "").trim();
      const allLines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      text = allLines.join(" ").trim();
      text = text.replace(/^["'«»\-–—*]+|["'«»\-–—*]+$/g, "").trim();
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      addLog(`📊 Groq - عدد الكلمات: ${wordCount}`, "info");
      if (wordCount >= minWords) {
        addLog(`✅ نجح Groq: ${model}`, "success");
        return text;
      }
      addLog(`⚠️ Groq ${model} أعطى ${wordCount} كلمة فقط، المحاولة التالية...`, "warning");
      lastErr = new Error(`قصير: ${wordCount} كلمة`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`⚠️ فشل Groq ${model}: ${msg.slice(0, 60)}`, "warning");
      lastErr = err;
    }
  }
  throw lastErr || new Error("فشلت جميع نماذج Groq");
}

async function generateDuaa(geminiKey: string, videoDuration: number, _style: string, groqKey = ""): Promise<string> {
  const minWords = 15;
  const maxWords = 20;
  addLog(`📏 طول الفيديو: ${videoDuration.toFixed(1)}ث → دعاء من ${minWords}-${maxWords} كلمة`, "info");

  // Random Islamic theme added to the request each time
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

  // Short and clear prompt to minimize token usage
  const prompt = `اكتب دعاءً إسلامياً بين ${minWords} و${maxWords} كلمة بالعربية الفصحى مع التشكيل الكامل، موضوعه: ${randomTheme}. فقط نص الدعاء بدون أي مقدمة أو شرح.`;

  // Preferred Gemini models to try (no separate listing call to save quota)
  const geminiModels = [
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  const genAI = new GoogleGenerativeAI(geminiKey);

  for (const modelName of geminiModels) {
    try {
      addLog(`🤖 محاولة: ${modelName}`, "processing");
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 300 },
      });

      const raw = result.response.text().trim();
      const text = raw
        .split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
        .join(" ")
        .replace(/^["'«»\-–—*#]+|["'«»\-–—*#]+$/g, "")
        .trim();

      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      addLog(`📊 عدد الكلمات: ${wordCount}`, "info");

      if (wordCount >= minWords) {
        addLog(`✅ نجح: ${modelName}`, "success");
        return text;
      }
      addLog(`⚠️ ${modelName}: ${wordCount} كلمة فقط، التالي...`, "warning");
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
      return await generateDuaaWithGroq(groqKey, minWords, maxWords, randomTheme, prompt);
    } catch (groqErr) {
      const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      addLog(`❌ فشل Groq: ${msg.slice(0, 60)}`, "error");
    }
  }

  throw new Error("فشل توليد الدعاء من جميع النماذج المتاحة.");
}

async function generateTTS(text: string, outputPath: string, slow: boolean) {
  // Use Python gTTS (already installed in the environment)
  const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const speed = slow ? "slow=True" : "slow=False";
  await execAsync(
    `python3 -c "from gtts import gTTS; gTTS(text='${escapedText}', lang='ar', ${speed}).save('${outputPath}')"`
  );
}

/**
 * Render Arabic text as a transparent PNG using Python Pillow.
 * This correctly handles Arabic reshaping, bidi, word-wrap, and stroke.
 */
async function renderArabicTextPNG(params: {
  text: string;
  videoWidth: number;
  videoHeight: number;
  fontPath: string;
  fontSize: number;
  textColor: string;   // hex "RRGGBB"
  strokeWidth: number;
  yRatio: number;      // 0-1 vertical position
  outputPng: string;
}): Promise<void> {
  const scriptPath = path.join(os.tmpdir(), `render_arabic_${Date.now()}.py`);
  const txtPath = path.join(os.tmpdir(), `arabic_text_${Date.now()}.txt`);

  fs.writeFileSync(txtPath, params.text, "utf8");

  const r = parseInt(params.textColor.slice(0, 2), 16);
  const g = parseInt(params.textColor.slice(2, 4), 16);
  const b = parseInt(params.textColor.slice(4, 6), 16);

  const script = `
import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont
import sys, textwrap

with open(${JSON.stringify(txtPath)}, encoding='utf-8') as f:
    text = f.read().strip()

W = ${params.videoWidth}
H = ${params.videoHeight}
font_size = ${params.fontSize}
y_ratio = ${params.yRatio}
stroke = ${params.strokeWidth}
text_r, text_g, text_b = ${r}, ${g}, ${b}

font_path = ${JSON.stringify(params.fontPath)}
font = None
# Try requested font first, then fallback to known Arabic fonts
fallback_fonts = [
    font_path,
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/bein.ttf",
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/boutros.ttf",
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/dima.ttf",
    "/home/runner/workspace/artifacts/telegram-bot-studio/fonts/takeaway.ttf",
]
for fp in fallback_fonts:
    if not fp:
        continue
    try:
        font = ImageFont.truetype(fp, font_size)
        break
    except Exception:
        continue
if font is None:
    raise RuntimeError("لم يتم العثور على أي خط عربي صالح!")

# Word-wrap: split Arabic text into lines that fit within 90% of video width
words = text.split()
lines = []
current = []
dummy_img = Image.new('RGBA', (W, H), (0,0,0,0))
dummy_draw = ImageDraw.Draw(dummy_img)

for word in words:
    test_line = ' '.join(current + [word])
    reshaped_test = get_display(arabic_reshaper.reshape(test_line))
    bbox = dummy_draw.textbbox((0,0), reshaped_test, font=font)
    if bbox[2] - bbox[0] > W * 0.90 and current:
        lines.append(' '.join(current))
        current = [word]
    else:
        current.append(word)
if current:
    lines.append(' '.join(current))

# Reshape each line for correct RTL display
display_lines = [get_display(arabic_reshaper.reshape(line)) for line in lines]

# Calculate total text block height
line_heights = []
for dl in display_lines:
    bbox = dummy_draw.textbbox((0,0), dl, font=font)
    line_heights.append(bbox[3] - bbox[1])
line_spacing = int(font_size * 0.3)
total_h = sum(line_heights) + line_spacing * (len(display_lines) - 1)

# Center the block vertically at y_ratio
block_top = int(H * y_ratio) - total_h // 2

# Draw on transparent canvas
img = Image.new('RGBA', (W, H), (0,0,0,0))
draw = ImageDraw.Draw(img)

y_cursor = block_top
for dl, lh in zip(display_lines, line_heights):
    bbox = draw.textbbox((0,0), dl, font=font)
    lw = bbox[2] - bbox[0]
    x = (W - lw) // 2

    # Shadow
    draw.text((x+2, y_cursor+2), dl, font=font, fill=(0,0,0,180))

    # Stroke
    if stroke > 0:
        for dx in range(-stroke, stroke+1):
            for dy in range(-stroke, stroke+1):
                if abs(dx)+abs(dy) <= stroke:
                    draw.text((x+dx, y_cursor+dy), dl, font=font, fill=(0,0,0,230))

    # Main text
    draw.text((x, y_cursor), dl, font=font, fill=(text_r, text_g, text_b, 255))
    y_cursor += lh + line_spacing

img.save(${JSON.stringify(params.outputPng)})
`;

  fs.writeFileSync(scriptPath, script, "utf8");
  try {
    await execAsync(`python3 "${scriptPath}"`, { timeout: 30000 });
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(txtPath); } catch {}
  }
}

async function processVideoWithText(
  videoPath: string,
  audioPath: string,
  duaaText: string,
  outputPath: string,
  settings: AppSettings
) {
  // 1. Get video dimensions and duration
  const [videoW, videoH, videoDuration] = await Promise.all([
    getVideoWidth(videoPath),
    getVideoHeight(videoPath),
    getVideoDuration(videoPath),
  ]);
  addLog(`📐 أبعاد الفيديو: ${videoW}×${videoH} | المدة: ${videoDuration.toFixed(1)}ث`, "info");

  const fontPath = getFontPath(settings.font);
  const textColor = settings.textColor.replace("#", "");
  const fontSize = settings.fontSize;
  const strokeWidth = settings.strokeThickness;
  const yRatio = settings.yPosition / 100;

  // 2. Render Arabic text as transparent PNG using Pillow
  const textPng = path.join(os.tmpdir(), `text_overlay_${Date.now()}.png`);
  addLog(`🖼️ رسم النص العربي كصورة...`, "processing");
  await renderArabicTextPNG({
    text: duaaText,
    videoWidth: videoW,
    videoHeight: videoH,
    fontPath,
    fontSize,
    textColor,
    strokeWidth,
    yRatio,
    outputPng: textPng,
  });
  addLog(`✅ تم رسم النص بنجاح`, "success");

  // 3. Check if video has audio
  let hasAudio = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`
    );
    hasAudio = stdout.trim().length > 0;
  } catch {}

  // 4. Build ffmpeg command:
  //    input 0: original video
  //    input 1: TTS audio
  //    input 2: text PNG overlay
  //    - Overlay PNG on video for full duration
  //    - Keep FULL original video length (no trimming)
  //    - Mix original audio at 50% + TTS audio at 100%
  let filterComplex: string;
  let audioMap: string;

  if (hasAudio) {
    filterComplex = [
      `[0:v][2:v]overlay=0:0[vout]`,
      `[1:a]apad=whole_dur=${videoDuration}[tts_full]`,
      `[0:a]volume=0.5[orig_vol]`,
      `[tts_full][orig_vol]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  } else {
    filterComplex = [
      `[0:v][2:v]overlay=0:0[vout]`,
      `[1:a]apad=whole_dur=${videoDuration}[aout]`,
    ].join(";");
    audioMap = `[aout]`;
  }

  const cmd = [
    "ffmpeg",
    `-i "${videoPath}"`,
    `-i "${audioPath}"`,
    `-i "${textPng}"`,
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
    await execAsync(cmd, { timeout: 180000 });
  } finally {
    try { fs.unlinkSync(textPng); } catch {}
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

let currentSettings: AppSettings = { ...defaultSettings };

export function getSettings() {
  return currentSettings;
}

export function updateSettings(settings: Partial<AppSettings>) {
  currentSettings = { ...currentSettings, ...settings };
  return currentSettings;
}
