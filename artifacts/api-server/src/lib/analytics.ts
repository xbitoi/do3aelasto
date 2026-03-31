import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

export interface PublishRecord {
  id: string;
  timestamp: number;
  date: string;
  title: string;
  duaaText: string;
  platforms: {
    platform: string;
    success: boolean;
    url?: string;
    videoId?: string;
    channelName?: string;
    error?: string;
  }[];
  videoSize?: string;
  duration?: number;
  aspectRatio?: string;
  scheduled?: boolean;
}

export interface ChannelStat {
  channelId: string;
  channelName: string;
  type: "telegram" | "youtube" | "facebook";
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  checkedAt: number;
}

export interface AnalyticsSummary {
  totalPublished: number;
  weeklyPublished: number;
  platforms: Record<string, { total: number; success: number }>;
  bestDay: string;
  bestHour: number;
  recentRecords: PublishRecord[];
  channelStats: ChannelStat[];
}

const ANALYTICS_FILE = path.join(process.cwd(), "analytics.json");
const CHANNEL_STATS_FILE = path.join(process.cwd(), "channel-stats.json");

interface AnalyticsData {
  records: PublishRecord[];
}

function loadAnalytics(): AnalyticsData {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8"));
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load analytics");
  }
  return { records: [] };
}

function saveAnalytics(data: AnalyticsData) {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to save analytics");
  }
}

export function recordPublish(record: Omit<PublishRecord, "id" | "timestamp" | "date">) {
  const data = loadAnalytics();
  const now = new Date();
  const arabicDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const fullRecord: PublishRecord = {
    ...record,
    id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
    timestamp: now.getTime(),
    date: `${arabicDays[now.getDay()]} ${now.getDate()} ${arabicMonths[now.getMonth()]} ${now.getFullYear()} — ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
  };
  data.records.unshift(fullRecord);
  if (data.records.length > 500) data.records = data.records.slice(0, 500);
  saveAnalytics(data);
  return fullRecord;
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const data = loadAnalytics();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const weeklyRecords = data.records.filter(r => r.timestamp >= weekAgo);
  const platforms: Record<string, { total: number; success: number }> = {};
  const dayCount: Record<string, number> = {};
  const hourCount: Record<number, number> = {};

  for (const rec of data.records) {
    const date = new Date(rec.timestamp);
    const dayKey = date.toLocaleDateString("ar-EG", { weekday: "long" });
    dayCount[dayKey] = (dayCount[dayKey] || 0) + 1;
    const h = date.getHours();
    hourCount[h] = (hourCount[h] || 0) + 1;

    for (const p of rec.platforms) {
      if (!platforms[p.platform]) platforms[p.platform] = { total: 0, success: 0 };
      platforms[p.platform].total++;
      if (p.success) platforms[p.platform].success++;
    }
  }

  const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const bestHour = parseInt(
    Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "8"
  );

  let channelStats: ChannelStat[] = [];
  try {
    if (fs.existsSync(CHANNEL_STATS_FILE)) {
      channelStats = JSON.parse(fs.readFileSync(CHANNEL_STATS_FILE, "utf8"));
    }
  } catch {}

  return {
    totalPublished: data.records.length,
    weeklyPublished: weeklyRecords.length,
    platforms,
    bestDay,
    bestHour,
    recentRecords: data.records.slice(0, 20),
    channelStats,
  };
}

export function saveChannelStats(stats: ChannelStat[]) {
  try {
    fs.writeFileSync(CHANNEL_STATS_FILE, JSON.stringify(stats, null, 2), "utf8");
  } catch {}
}

export function loadChannelStats(): ChannelStat[] {
  try {
    if (fs.existsSync(CHANNEL_STATS_FILE)) {
      return JSON.parse(fs.readFileSync(CHANNEL_STATS_FILE, "utf8"));
    }
  } catch {}
  return [];
}

export function buildWeeklyReportText(summary: AnalyticsSummary): string {
  const now = new Date();
  const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const dateStr = `${now.getDate()} ${arabicMonths[now.getMonth()]} ${now.getFullYear()}`;

  const platformLines = Object.entries(summary.platforms).map(([name, stats]) => {
    const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
    const icon = name === "يوتيوب" ? "📺" : name === "فيسبوك" ? "📘" : name === "تيك توك" ? "🎵" : "📡";
    return `${icon} *${name}:* ${stats.success}/${stats.total} نجاح (${rate}%)`;
  });

  const channelLines = summary.channelStats.length > 0
    ? summary.channelStats.map(ch => {
        const icon = ch.type === "telegram" ? "✈️" : ch.type === "youtube" ? "📺" : "📘";
        const sub = ch.subscriberCount ? ` — ${ch.subscriberCount.toLocaleString()} متابع` : "";
        const views = ch.viewCount ? ` — ${ch.viewCount.toLocaleString()} مشاهدة` : "";
        return `${icon} *${ch.channelName}*${sub}${views}`;
      })
    : ["_لا توجد بيانات قنوات بعد_"];

  const bestRecent = summary.recentRecords.slice(0, 3);
  const recentLines = bestRecent.length > 0
    ? bestRecent.map((r, i) => {
        const successCount = r.platforms.filter(p => p.success).length;
        return `${i + 1}. ${r.title || r.duaaText?.slice(0, 40) + "..."} ✅ ${successCount} منصات`;
      })
    : ["_لا يوجد نشر مسجل_"];

  return [
    `📊 *التقرير الأسبوعي — استوديو الدعاء*`,
    `📅 ${dateStr}`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `📈 *إحصائيات هذا الأسبوع:*`,
    `• النشر هذا الأسبوع: *${summary.weeklyPublished}* منشور`,
    `• إجمالي النشر: *${summary.totalPublished}* منشور`,
    `• أفضل يوم للنشر: *${summary.bestDay}*`,
    `• أفضل وقت: *${summary.bestHour}:00*`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `📡 *أداء المنصات:*`,
    ...platformLines,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `📺 *إحصائيات القنوات:*`,
    ...channelLines,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `🏆 *آخر المنشورات:*`,
    ...recentLines,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `🤲 _بارك الله في جهودك ونشر الخير_`,
    `_سبحان الله وبحمده سبحان الله العظيم_ 🤍`,
  ].join("\n");
}
