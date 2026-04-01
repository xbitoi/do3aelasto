import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Youtube, Facebook, Bot, RefreshCw, TrendingUp, Eye, ThumbsUp,
  MessageCircle, Share2, Users, Video, BarChart2, AlertCircle,
  Link2, Play, Calendar, Zap, Globe, Loader2, DollarSign, BadgeDollarSign, Info
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface YTChannel { id:string; name:string; description:string; thumbnail:string; country:string; subscriberCount:number; viewCount:number; videoCount:number; hiddenSubscriberCount:boolean; }
interface YTVideo { id:string; title:string; publishedAt:string; thumbnail:string; views:number; likes:number; comments:number; duration:string; }
interface YTEarnings { realRevenue30d:number|null; estTotalLow:number; estTotalHigh:number; est30dLow:number; est30dHigh:number; currency:string; }
interface YTData { platform:"youtube"; channel:YTChannel; videos:YTVideo[]; earnings?:YTEarnings; fetchedAt:number; error?:string; }

interface FBPage { id:string; name:string; about:string; category:string; picture:string; cover:string; fanCount:number; followersCount:number; talkingAbout:number; }
interface FBInsights { weeklyImpressions:number; weeklyReach:number; weeklyEngaged:number; weeklyEngagement:number; weeklyViews:number; }
interface FBPost { id:string; message:string; createdAt:string; picture:string; likes:number; comments:number; shares:number; }
interface FBEarnings { estMonthlyLow:number; estMonthlyHigh:number; currency:string; }
interface FBData { platform:"facebook"; page:FBPage; insights:FBInsights; earnings?:FBEarnings; posts:FBPost[]; fetchedAt:number; error?:string; }

interface TTUser { username:string; displayName:string; avatar:string; profileUrl:string; followersCount:number; followingCount:number; likesCount:number; videoCount:number; }
interface TTVideo { id:string; title:string; cover:string; shareUrl:string; views:number; likes:number; comments:number; shares:number; createdAt:string; duration:number; }
interface TTEarnings { est10dLow:number; est10dHigh:number; totalViews:number; currency:string; }
interface TTData { platform:"tiktok"; user:TTUser; videos:TTVideo[]; earnings?:TTEarnings; fetchedAt:number; error?:string; }

interface BotData { platform:"bot"; summary:any; connected:{youtube:boolean;facebook:boolean;tiktok:boolean;}; fetchedAt:number; }

type PlatformData = YTData | FBData | TTData | BotData | { error:string };
type Platform = "youtube" | "facebook" | "tiktok" | "bot";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "م";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "ك";
  return n.toLocaleString("en-US");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "اليوم";
  if (d === 1) return "أمس";
  if (d < 7) return `قبل ${d} أيام`;
  if (d < 30) return `قبل ${Math.floor(d/7)} أسابيع`;
  return `قبل ${Math.floor(d/30)} شهور`;
}

function parseDuration(iso?: string): string {
  if (!iso) return "—";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "—";
  const h = parseInt(m[1] || "0"), min = parseInt(m[2] || "0"), s = parseInt(m[3] || "0");
  if (h > 0) return `${h}:${String(min).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${min}:${String(s).padStart(2,"0")}`;
}

function durationToSeconds(iso?: string): number {
  if (!iso) return 999;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 999;
  return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
}

// ─── Stat Mini Card ───────────────────────────────────────────────────────────

function Mini({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, { bg: string; border: string; icon: string }> = {
    "from-red-500":    { bg: "bg-red-500/10",    border: "border-red-500/25",    icon: "text-red-400" },
    "from-blue-500":   { bg: "bg-blue-500/10",   border: "border-blue-500/25",   icon: "text-blue-400" },
    "from-pink-500":   { bg: "bg-pink-500/10",   border: "border-pink-500/25",   icon: "text-pink-400" },
    "from-green-500":  { bg: "bg-green-500/10",  border: "border-green-500/25",  icon: "text-green-400" },
    "from-purple-500": { bg: "bg-purple-500/10", border: "border-purple-500/25", icon: "text-purple-400" },
    "from-orange-500": { bg: "bg-orange-500/10", border: "border-orange-500/25", icon: "text-orange-400" },
    "from-primary":    { bg: "bg-primary/10",    border: "border-primary/25",    icon: "text-primary" },
  };
  const style = colorMap[color] ?? colorMap["from-primary"];

  return (
    <div className={cn("relative rounded-2xl border p-4 overflow-hidden group hover:shadow-lg transition-all", style.bg, style.border)}>
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-xl border", style.bg, style.border)}>
          <Icon className={cn("w-4 h-4", style.icon)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-semibold">{label}</p>
          <p className="text-lg font-black text-foreground leading-none mt-0.5">{typeof value === "number" ? fmtNum(value) : value}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Not Connected ────────────────────────────────────────────────────────────

function NotConnected({ platform }: { platform: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="p-5 bg-yellow-500/10 border border-yellow-500/20 rounded-[1.5rem]">
        <Link2 className="w-10 h-10 text-yellow-400" />
      </div>
      <h3 className="text-xl font-black text-foreground">لم يتم ربط {platform} بعد</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        أضف مفتاح {platform} من صفحة <span className="text-primary font-bold">الإعدادات المتقدمة</span> لتفعيل تحليلات هذه المنصة
      </p>
    </div>
  );
}

function ApiError({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-[1.5rem]">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <p className="text-sm font-bold text-red-400 max-w-sm">{msg}</p>
    </div>
  );
}

function TokenExpired({ platform }: { platform: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="p-5 bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem]">
        <AlertCircle className="w-10 h-10 text-orange-400" />
      </div>
      <h3 className="text-xl font-black text-foreground">انتهت صلاحية رمز {platform}</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        يرجى تجديد الرمز المميز من صفحة <span className="text-primary font-bold">الإعدادات المتقدمة</span> ثم عُد هنا
      </p>
    </div>
  );
}

// ─── YouTube Tab ──────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ─── Compact Earnings Bar (shared across all platforms) ───────────────────────

interface EarningsItem { label: string; low: number; high: number; real?: number | null; }

function EarningsBar({ items, note, accent = "yellow" }: {
  items: EarningsItem[];
  note: string;
  accent?: "yellow" | "green" | "pink" | "blue";
}) {
  const colors = {
    yellow: { border: "border-yellow-500/20", bg: "bg-yellow-500/6", icon: "text-yellow-400", val: "text-yellow-400" },
    green:  { border: "border-green-500/20",  bg: "bg-green-500/6",  icon: "text-green-400",  val: "text-green-400" },
    pink:   { border: "border-pink-500/20",   bg: "bg-pink-500/6",   icon: "text-pink-400",   val: "text-pink-400" },
    blue:   { border: "border-blue-500/20",   bg: "bg-blue-500/6",   icon: "text-blue-400",   val: "text-blue-400" },
  }[accent];

  return (
    <div className={cn("rounded-2xl border px-4 py-3", colors.border, colors.bg)}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <DollarSign className={cn("w-3.5 h-3.5 shrink-0", colors.icon)} />
        <span className={cn("text-[11px] font-black uppercase tracking-wider", colors.icon)}>الأرباح التقديرية</span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[11px] text-muted-foreground font-medium shrink-0">{item.label}:</span>
            {item.real != null && item.real > 0 ? (
              <span className={cn("text-sm font-black text-green-400 flex items-center gap-1")}>
                <BadgeDollarSign className="w-3 h-3 shrink-0" />
                {fmtUSD(item.real)}
                <span className="text-[10px] font-normal text-green-400/60">(حقيقي)</span>
              </span>
            ) : (
              <span className={cn("text-sm font-black", colors.val)}>
                {fmtUSD(item.low)} – {fmtUSD(item.high)}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/40 mt-2 leading-tight flex items-start gap-1">
        <Info className="w-2.5 h-2.5 shrink-0 mt-0.5 opacity-60" />
        {note}
      </p>
    </div>
  );
}

function YouTubeAnalytics({ data }: { data: YTData }) {
  const { channel, videos, earnings } = data;
  const [ytTab, setYtTab] = useState<"videos" | "shorts">("videos");

  const regularVideos = videos.filter(v => durationToSeconds(v.duration) >= 60);
  const shortVideos   = videos.filter(v => durationToSeconds(v.duration) <  60);

  const displayedVideos = ytTab === "videos" ? regularVideos : shortVideos;

  const totalVideoViews = videos.reduce((s, v) => s + v.views, 0);
  const totalLikes = videos.reduce((s, v) => s + v.likes, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Channel Header */}
      <div className="relative rounded-[2rem] bg-gradient-to-br from-red-950/40 to-card border border-red-500/20 overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex items-start gap-5 flex-wrap">
          {channel.thumbnail && (
            <img src={channel.thumbnail} alt={channel.name} className="w-20 h-20 rounded-2xl object-cover border-2 border-red-500/30 shadow-xl shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Youtube className="w-5 h-5 text-red-400 shrink-0" />
              <h3 className="text-2xl font-black text-foreground truncate">{channel.name}</h3>
              {channel.country && <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-lg font-bold">{channel.country}</span>}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{channel.description || "لا يوجد وصف"}</p>
          </div>
        </div>
      </div>

      {/* Earnings – compact bar */}
      {earnings && (
        <EarningsBar
          accent="yellow"
          items={[
            { label: "آخر 30 يوم", low: earnings.est30dLow, high: earnings.est30dHigh, real: earnings.realRevenue30d },
            { label: "إجمالي القناة", low: earnings.estTotalLow, high: earnings.estTotalHigh },
          ]}
          note={`RPM تقديري $0.5–$3 / 1000 مشاهدة · بناءً على ${fmtNum(channel.viewCount)} مشاهدة إجمالية`}
        />
      )}

      {/* Channel Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Mini icon={Users} label="المشتركون" value={channel.hiddenSubscriberCount ? "مخفي" : channel.subscriberCount} color="from-red-500" />
        <Mini icon={Eye} label="إجمالي المشاهدات" value={channel.viewCount} color="from-red-500" />
        <Mini icon={Video} label="عدد الفيديوهات" value={channel.videoCount} color="from-red-500" />
        <Mini icon={Eye} label="مشاهدات آخر 10" value={totalVideoViews} color="from-orange-500" />
        <Mini icon={ThumbsUp} label="إعجابات آخر 10" value={totalLikes} color="from-orange-500" />
        <Mini icon={TrendingUp} label="معدّل التفاعل" value={totalVideoViews > 0 ? `${((totalLikes / totalVideoViews) * 100).toFixed(2)}%` : "—"} color="from-green-500" />
      </div>

      {/* Recent Videos — with tabs Videos/Shorts */}
      {videos.length > 0 && (
        <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3 flex-wrap">
            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl">
              <Play className="w-4 h-4 text-red-400" />
            </div>
            <h4 className="font-black text-foreground text-lg flex-1">آخر الفيديوهات</h4>
            {/* Video / Shorts tabs */}
            <div className="flex gap-1.5 bg-black/30 p-1 rounded-xl border border-border/40">
              <button
                onClick={() => setYtTab("videos")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                  ytTab === "videos"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Video className="w-3 h-3" />
                فيديوهات ({regularVideos.length})
              </button>
              <button
                onClick={() => setYtTab("shorts")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                  ytTab === "shorts"
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-sm">▶</span>
                شورتس ({shortVideos.length})
              </button>
            </div>
          </div>

          {displayedVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 gap-2">
              <Video className="w-8 h-8 opacity-30" />
              <p className="text-sm font-bold">لا توجد {ytTab === "shorts" ? "شورتس" : "فيديوهات"} في آخر 10 مقاطع</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {displayedVideos.map((v) => (
                <div key={v.id} className="flex items-start gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                  {v.thumbnail && (
                    <img src={v.thumbnail} alt={v.title} className="w-24 h-16 rounded-xl object-cover border border-border/30 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {durationToSeconds(v.duration) < 60 && (
                        <span className="text-[10px] font-black bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-md">SHORT</span>
                      )}
                    </div>
                    <a
                      href={`https://youtu.be/${v.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-foreground hover:text-red-400 transition-colors line-clamp-2 leading-snug"
                    >
                      {v.title}
                    </a>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{fmtNum(v.views)}</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmtNum(v.likes)}</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(v.comments)}</span>
                      <span className="text-[11px] text-muted-foreground/50">{parseDuration(v.duration)}</span>
                      <span className="text-[11px] text-muted-foreground/50 mr-auto">{timeAgo(v.publishedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Facebook Tab ─────────────────────────────────────────────────────────────

function FacebookAnalytics({ data }: { data: FBData }) {
  const { page, insights, earnings, posts } = data;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="relative rounded-[2rem] bg-gradient-to-br from-blue-950/40 to-card border border-blue-500/20 overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex items-start gap-5 flex-wrap">
          {page.picture && (
            <img src={page.picture} alt={page.name} className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500/30 shadow-xl shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Facebook className="w-5 h-5 text-blue-400 shrink-0" />
              <h3 className="text-2xl font-black text-foreground truncate">{page.name}</h3>
              {page.category && <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-lg font-bold">{page.category}</span>}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{page.about || "لا يوجد وصف"}</p>
          </div>
        </div>
      </div>

      {/* Earnings – compact bar (like YouTube) */}
      {earnings && (
        <EarningsBar
          accent="blue"
          items={[
            { label: "شهرياً (تقديري)", low: earnings.estMonthlyLow, high: earnings.estMonthlyHigh },
          ]}
          note={`CPM فيسبوك تقديري $0.5–$2 / 1000 انطباع · بناءً على ${fmtNum(insights.weeklyImpressions * 4)} انطباع شهري`}
        />
      )}

      {/* Page Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Mini icon={Users} label="المتابعون" value={page.followersCount} color="from-blue-500" />
        <Mini icon={Users} label="الإعجابات بالصفحة" value={page.fanCount} color="from-blue-500" />
        <Mini icon={Zap} label="يتحدث عنها" value={page.talkingAbout} color="from-blue-500" />
      </div>

      {/* Weekly Insights */}
      <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <BarChart2 className="w-4 h-4 text-blue-400" />
          </div>
          <h4 className="font-black text-foreground text-lg">إحصائيات الأسبوع الماضي</h4>
        </div>
        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Mini icon={Eye} label="الانطباعات" value={insights.weeklyImpressions} color="from-blue-500" />
          <Mini icon={Globe} label="الوصول" value={insights.weeklyReach} color="from-blue-500" />
          <Mini icon={Users} label="المتفاعلون" value={insights.weeklyEngaged} color="from-blue-500" />
          <Mini icon={Zap} label="إجمالي التفاعلات" value={insights.weeklyEngagement} color="from-blue-500" />
          <Mini icon={Eye} label="زيارات الصفحة" value={insights.weeklyViews} color="from-blue-500" />
          <Mini icon={TrendingUp} label="معدّل التفاعل" value={insights.weeklyReach > 0 ? `${((insights.weeklyEngaged / insights.weeklyReach) * 100).toFixed(2)}%` : "—"} color="from-green-500" />
        </div>
      </div>

      {/* Recent Posts */}
      {posts.length > 0 && (
        <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="font-black text-foreground text-lg">آخر المنشورات</h4>
          </div>
          <div className="divide-y divide-border/30">
            {posts.map((p) => (
              <div key={p.id} className="flex items-start gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                {p.picture && (
                  <img src={p.picture} alt="" className="w-16 h-16 rounded-xl object-cover border border-border/30 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground/80 line-clamp-2 leading-snug">{p.message}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmtNum(p.likes)}</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(p.comments)}</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Share2 className="w-3 h-3" />{fmtNum(p.shares)}</span>
                    <span className="text-[11px] text-muted-foreground/50 mr-auto">{timeAgo(p.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TikTok Tab ───────────────────────────────────────────────────────────────

function TikTokAnalytics({ data }: { data: TTData }) {
  const { user, videos, earnings } = data;
  const totalViews = videos.reduce((s, v) => s + v.views, 0);
  const totalLikes = videos.reduce((s, v) => s + v.likes, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Profile Header */}
      <div className="relative rounded-[2rem] bg-gradient-to-br from-pink-950/40 to-card border border-pink-500/20 overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex items-start gap-5 flex-wrap">
          {user.avatar && (
            <img src={user.avatar} alt={user.displayName} className="w-20 h-20 rounded-full object-cover border-2 border-pink-500/30 shadow-xl shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🎵</span>
              <h3 className="text-2xl font-black text-foreground">{user.displayName}</h3>
              <span className="text-xs bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded-lg font-bold">@{user.username}</span>
            </div>
            {user.profileUrl && (
              <a href={user.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-pink-400 hover:underline">عرض الملف الشخصي ↗</a>
            )}
          </div>
        </div>
      </div>

      {/* Earnings – compact bar */}
      {earnings && (
        <EarningsBar
          accent="pink"
          items={[
            { label: "آخر 10 فيديوهات", low: earnings.est10dLow, high: earnings.est10dHigh },
          ]}
          note={`Creator Fund تقديري $0.02–$0.1 / 1000 مشاهدة · بناءً على ${fmtNum(earnings.totalViews)} مشاهدة`}
        />
      )}

      {/* Profile Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini icon={Users} label="المتابعون" value={user.followersCount} color="from-pink-500" />
        <Mini icon={Users} label="يتابع" value={user.followingCount} color="from-pink-500" />
        <Mini icon={ThumbsUp} label="إجمالي الإعجابات" value={user.likesCount} color="from-pink-500" />
        <Mini icon={Video} label="عدد الفيديوهات" value={user.videoCount} color="from-pink-500" />
      </div>

      {/* Recent Videos Stats */}
      {videos.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Mini icon={Eye} label="مشاهدات آخر 10 فيديوهات" value={totalViews} color="from-purple-500" />
            <Mini icon={ThumbsUp} label="إعجابات آخر 10 فيديوهات" value={totalLikes} color="from-purple-500" />
            <Mini icon={TrendingUp} label="معدّل التفاعل" value={totalViews > 0 ? `${((totalLikes / totalViews) * 100).toFixed(2)}%` : "—"} color="from-green-500" />
          </div>

          <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
              <div className="p-2 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                <Play className="w-4 h-4 text-pink-400" />
              </div>
              <h4 className="font-black text-foreground text-lg">آخر الفيديوهات</h4>
            </div>
            <div className="divide-y divide-border/30">
              {videos.map((v) => (
                <div key={v.id} className="flex items-start gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                  {v.cover && (
                    <img src={v.cover} alt={v.title} className="w-14 h-20 rounded-xl object-cover border border-border/30 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {v.shareUrl ? (
                      <a href={v.shareUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-foreground hover:text-pink-400 transition-colors line-clamp-2">
                        {v.title !== "—" ? v.title : "مقطع تيك توك ↗"}
                      </a>
                    ) : (
                      <p className="text-sm font-bold text-foreground line-clamp-2">{v.title}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{fmtNum(v.views)}</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmtNum(v.likes)}</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(v.comments)}</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Share2 className="w-3 h-3" />{fmtNum(v.shares)}</span>
                      {v.createdAt && <span className="text-[11px] text-muted-foreground/50 mr-auto">{timeAgo(v.createdAt)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Bot Tab ──────────────────────────────────────────────────────────────────

function BotAnalyticsTab({ data }: { data: BotData }) {
  const { summary, connected } = data;
  const totalSuccess = summary ? Object.values(summary.platforms as Record<string, {total:number;success:number}>).reduce((acc, p) => acc + p.success, 0) : 0;
  const totalAttempts = summary ? Object.values(summary.platforms as Record<string, {total:number;success:number}>).reduce((acc, p) => acc + p.total, 0) : 0;
  const overallRate = totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 100) : 0;

  const platforms: Record<string, { icon: React.ElementType; color: string; barColor: string }> = {
    "يوتيوب": { icon: Youtube, color: "text-red-400", barColor: "bg-red-500" },
    "فيسبوك": { icon: Facebook, color: "text-blue-400", barColor: "bg-blue-500" },
    "تيك توك": { icon: () => <span className="text-sm">🎵</span>, color: "text-pink-400", barColor: "bg-pink-500" },
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini icon={BarChart2} label="إجمالي المنشورات" value={summary?.totalPublished ?? 0} color="from-primary" />
        <Mini icon={TrendingUp} label="هذا الأسبوع" value={summary?.weeklyPublished ?? 0} color="from-green-500" />
        <Mini icon={Calendar} label="أفضل يوم" value={summary?.bestDay ?? "—"} color="from-blue-500" />
        <Mini icon={Zap} label="نسبة النجاح" value={`${overallRate}%`} color="from-purple-500" />
      </div>

      {/* Connected Platforms */}
      <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
          <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl">
            <Link2 className="w-4 h-4 text-primary" />
          </div>
          <h4 className="font-black text-foreground text-lg">المنصات المرتبطة</h4>
        </div>
        <div className="p-5 grid grid-cols-3 gap-3">
          {[
            { key: "youtube",  label: "يوتيوب",  icon: Youtube,  activeClass: "bg-red-500/10 border-red-500/20",  iconClass: "text-red-400" },
            { key: "facebook", label: "فيسبوك",  icon: Facebook, activeClass: "bg-blue-500/10 border-blue-500/20", iconClass: "text-blue-400" },
            { key: "tiktok",   label: "تيك توك", icon: () => <span className="text-lg">🎵</span>, activeClass: "bg-pink-500/10 border-pink-500/20", iconClass: "text-pink-400" },
          ].map(({ key, label, icon: Icon, activeClass, iconClass }) => {
            const ok = connected[key as keyof typeof connected];
            return (
              <div key={key} className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all", ok ? activeClass : "bg-black/20 border-border/30 opacity-60")}>
                <Icon className={ok ? iconClass : "text-muted-foreground"} />
                <span className="text-xs font-black text-foreground">{label}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg", ok ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                  {ok ? "✓ مرتبط" : "✗ غير مرتبط"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-platform breakdown */}
      {summary && Object.keys(summary.platforms ?? {}).length > 0 && (
        <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl">
              <BarChart2 className="w-4 h-4 text-primary" />
            </div>
            <h4 className="font-black text-foreground text-lg">أداء النشر لكل منصة</h4>
          </div>
          <div className="p-6 space-y-5">
            {Object.entries(summary.platforms as Record<string, {total:number;success:number}>).map(([name, stats]) => {
              const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
              const cfg = platforms[name] ?? { icon: Bot, color: "text-primary", barColor: "bg-primary" };
              const Icon = cfg.icon;
              return (
                <div key={name} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("w-4 h-4", cfg.color)} />
                      <span className="text-sm font-bold text-foreground">{name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="text-green-400">{stats.success} نجاح</span>
                      <span className="text-muted-foreground/50">/ {stats.total}</span>
                      <span className={cn("px-2 py-0.5 rounded-lg", rate >= 80 ? "bg-green-500/15 text-green-400" : rate >= 50 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400")}>{rate}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-700", cfg.barColor)} style={{ width: `${rate}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent records */}
      {summary?.recentRecords?.length > 0 && (
        <div className="rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <h4 className="font-black text-foreground text-lg">آخر المنشورات</h4>
          </div>
          <div className="divide-y divide-border/30">
            {summary.recentRecords.map((rec: any) => (
              <div key={rec.id} className="flex items-start gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                <div className={cn("mt-1 p-1.5 rounded-lg shrink-0", rec.platforms?.every((p:any)=>p.success) ? "bg-green-500/15" : "bg-yellow-500/15")}>
                  {rec.platforms?.every((p:any)=>p.success) ? <span className="text-green-400 text-xs">✓</span> : <span className="text-yellow-400 text-xs">!</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{rec.duaaText?.slice(0, 80) || rec.title || "—"}...</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {rec.platforms?.map((p: any, i: number) => (
                      <span key={i} className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg", p.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                        {p.platform} {p.success ? "✓" : "✗"}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground/40 shrink-0">{rec.date?.split("—")[0]?.trim()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Analytics Page ──────────────────────────────────────────────────────

const PLATFORMS: { id: Platform; label: string; icon: React.ElementType; accent: string }[] = [
  { id: "youtube",  label: "يوتيوب",  icon: Youtube,  accent: "red"  },
  { id: "facebook", label: "فيسبوك",  icon: Facebook, accent: "blue" },
  { id: "tiktok",   label: "تيك توك", icon: () => <span className="text-base">🎵</span>, accent: "pink" },
  { id: "bot",      label: "البوت",   icon: Bot,      accent: "violet" },
];

const accentMap: Record<string, string> = {
  red: "border-red-500/60 text-red-400 bg-red-500/10",
  blue: "border-blue-500/60 text-blue-400 bg-blue-500/10",
  pink: "border-pink-500/60 text-pink-400 bg-pink-500/10",
  violet: "border-violet-500/60 text-violet-400 bg-violet-500/10",
};
const inactiveTab = "border-border/30 text-muted-foreground bg-transparent hover:border-border/60 hover:text-foreground";

export function Analytics() {
  const [active, setActive] = useState<Platform>("youtube");
  const [cache, setCache] = useState<Partial<Record<Platform, PlatformData>>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchPlatform = useCallback(async (p: Platform, force = false) => {
    if (cache[p] && !force) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/${p}`);
      const data = await res.json();
      setCache(prev => ({ ...prev, [p]: data }));
    } catch {
      toast({ title: "خطأ", description: `تعذّر جلب بيانات ${p}`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [cache, toast]);

  useEffect(() => { fetchPlatform(active); }, [active]);

  const current = cache[active];

  const renderContent = () => {
    if (loading && !current) {
      return (
        <div className="flex flex-col items-center justify-center py-28 gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm font-bold text-muted-foreground">جارٍ جلب البيانات من المنصة...</p>
        </div>
      );
    }
    if (!current) return null;
    if ("error" in current && current.error) {
      const errMsg = current.error as string;
      if (errMsg.includes("لم يتم ربط")) return <NotConnected platform={PLATFORMS.find(p=>p.id===active)?.label ?? active} />;
      if (errMsg.includes("انتهت صلاحية")) return <TokenExpired platform={PLATFORMS.find(p=>p.id===active)?.label ?? active} />;
      return <ApiError msg={errMsg} />;
    }
    if (active === "youtube" && "channel" in current) return <YouTubeAnalytics data={current as YTData} />;
    if (active === "facebook" && "page" in current) return <FacebookAnalytics data={current as FBData} />;
    if (active === "tiktok" && "user" in current) return <TikTokAnalytics data={current as TTData} />;
    if (active === "bot" && "summary" in current) return <BotAnalyticsTab data={current as BotData} />;
    return null;
  };

  return (
    <div className="space-y-5 sm:space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">تحليل الأداء</h2>
          <p className="text-sm sm:text-lg font-semibold text-muted-foreground mt-0.5">بيانات حقيقية من كل منصة</p>
        </div>
        <button
          onClick={() => fetchPlatform(active, true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl bg-card border border-border hover:border-primary/40 text-sm font-black text-foreground transition-all disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          <span className="hidden sm:inline">تحديث</span>
        </button>
      </div>

      {/* Platform Tabs */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-hide">
          {PLATFORMS.map(({ id, label, icon: Icon, accent }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 sm:px-5 rounded-xl sm:rounded-2xl border font-black text-sm transition-all duration-200 shrink-0",
                active === id ? accentMap[accent] : inactiveTab
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[300px]">
        {renderContent()}
      </div>
    </div>
  );
}
