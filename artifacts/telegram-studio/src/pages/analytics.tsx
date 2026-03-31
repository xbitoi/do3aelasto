import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { PremiumCard, PremiumButton } from "@/components/ui-elements";
import {
  BarChart2, TrendingUp, Calendar, Clock, Send, RefreshCw,
  CheckCircle2, XCircle, Loader2, Youtube, Facebook, Radio
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PublishRecord {
  id: string;
  timestamp: number;
  date: string;
  title: string;
  duaaText: string;
  platforms: {
    platform: string;
    success: boolean;
    url?: string;
    channelName?: string;
    error?: string;
  }[];
  videoSize?: string;
  duration?: number;
  scheduled?: boolean;
}

interface AnalyticsSummary {
  totalPublished: number;
  weeklyPublished: number;
  platforms: Record<string, { total: number; success: number }>;
  bestDay: string;
  bestHour: number;
  recentRecords: PublishRecord[];
  channelStats: Array<{
    channelId: string;
    channelName: string;
    type: string;
    subscriberCount?: number;
    checkedAt: number;
  }>;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className={cn("relative rounded-[1.5rem] bg-card border border-border shadow-xl overflow-hidden p-6")}>
      <div className={cn("absolute inset-0 opacity-5 bg-gradient-to-br", color)} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
          <p className="text-4xl font-black text-foreground tracking-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1 font-semibold">{sub}</p>}
        </div>
        <div className={cn("p-3 rounded-2xl border", color.includes("green") ? "bg-green-500/10 border-green-500/20" : color.includes("blue") ? "bg-blue-500/10 border-blue-500/20" : color.includes("purple") ? "bg-purple-500/10 border-purple-500/20" : "bg-primary/10 border-primary/20")}>
          <Icon className={cn("w-6 h-6", color.includes("green") ? "text-green-400" : color.includes("blue") ? "text-blue-400" : color.includes("purple") ? "text-purple-400" : "text-primary")} />
        </div>
      </div>
    </div>
  );
}

function PlatformBar({ name, stats }: { name: string; stats: { total: number; success: number } }) {
  const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
  const icon = name === "يوتيوب" ? <Youtube className="w-4 h-4 text-red-400" /> :
    name === "فيسبوك" ? <Facebook className="w-4 h-4 text-blue-400" /> :
    <Radio className="w-4 h-4 text-pink-400" />;
  const color = name === "يوتيوب" ? "bg-red-500" : name === "فيسبوك" ? "bg-blue-500" : "bg-pink-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold text-foreground">{name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="text-green-400">{stats.success} ✓</span>
          <span className="text-muted-foreground/60">من {stats.total}</span>
          <span className={cn("px-2 py-0.5 rounded-lg", rate >= 80 ? "bg-green-500/15 text-green-400" : rate >= 50 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400")}>
            {rate}%
          </span>
        </div>
      </div>
      <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: PublishRecord }) {
  const successCount = record.platforms.filter(p => p.success).length;
  const totalCount = record.platforms.length;
  const allOk = successCount === totalCount;

  return (
    <div className="flex items-start gap-4 py-4 border-b border-border/30 last:border-0">
      <div className={cn("mt-1 p-1.5 rounded-lg shrink-0", allOk ? "bg-green-500/15" : "bg-yellow-500/15")}>
        {allOk
          ? <CheckCircle2 className="w-4 h-4 text-green-400" />
          : <XCircle className="w-4 h-4 text-yellow-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{record.title || "—"}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{record.duaaText?.slice(0, 60)}...</p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {record.platforms.map((p, i) => (
            <span key={i} className={cn("text-[10px] font-bold px-2 py-0.5 rounded-lg", p.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
              {p.platform} {p.success ? "✓" : "✗"}
            </span>
          ))}
          {record.scheduled && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/10 text-primary">⏰ مجدوَل</span>
          )}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground/50 shrink-0 text-left">
        {record.date?.split("—")[0]?.trim()}
      </div>
    </div>
  );
}

export function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportChatId, setReportChatId] = useState("");
  const { toast } = useToast();

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics");
      const data = await res.json() as AnalyticsSummary;
      setSummary(data);
    } catch {
      toast({ title: "خطأ", description: "تعذّر جلب بيانات التحليل", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sendReport = async () => {
    if (!reportChatId && !summary) return;
    setSendingReport(true);
    try {
      const res = await fetch("/api/analytics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: reportChatId || undefined }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        toast({ title: "✅ تم إرسال التقرير", description: "وصل التقرير إلى تيليغرام" });
      } else {
        toast({ title: "خطأ", description: data.error || "فشل إرسال التقرير", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setSendingReport(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-12 bg-card rounded-2xl w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-card rounded-[1.5rem]" />)}
        </div>
        <div className="h-64 bg-card rounded-[2rem]" />
      </div>
    );
  }

  const totalSuccess = summary
    ? Object.values(summary.platforms).reduce((acc, p) => acc + p.success, 0)
    : 0;
  const totalAttempts = summary
    ? Object.values(summary.platforms).reduce((acc, p) => acc + p.total, 0)
    : 0;
  const overallRate = totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 100) : 0;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-black mb-2 tracking-tight text-foreground">تحليل الأداء</h2>
          <p className="text-lg font-semibold text-muted-foreground">إحصائيات النشر والقنوات</p>
        </div>
        <PremiumButton variant="secondary" onClick={fetchAnalytics} isLoading={loading}>
          <RefreshCw className="w-4 h-4" />
          تحديث
        </PremiumButton>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي المنشورات"
          value={summary?.totalPublished || 0}
          sub="منذ البداية"
          icon={BarChart2}
          color="from-primary to-accent"
        />
        <StatCard
          label="هذا الأسبوع"
          value={summary?.weeklyPublished || 0}
          sub="آخر 7 أيام"
          icon={TrendingUp}
          color="from-green-500 to-emerald-500"
        />
        <StatCard
          label="أفضل يوم"
          value={summary?.bestDay || "—"}
          icon={Calendar}
          color="from-blue-500 to-cyan-500"
        />
        <StatCard
          label="نسبة النجاح"
          value={`${overallRate}%`}
          sub={`${totalSuccess} من ${totalAttempts}`}
          icon={CheckCircle2}
          color="from-purple-500 to-violet-500"
        />
      </div>

      {/* Platforms performance */}
      {summary && Object.keys(summary.platforms).length > 0 && (
        <PremiumCard title="أداء المنصات" icon={BarChart2}>
          <div className="space-y-5">
            {Object.entries(summary.platforms).map(([name, stats]) => (
              <PlatformBar key={name} name={name} stats={stats} />
            ))}
          </div>
          <div className="mt-6 p-4 bg-black/20 rounded-2xl border border-border/30 flex items-center gap-3">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground">
              أفضل وقت للنشر: <span className="text-primary font-black">{summary.bestHour}:00</span>
            </p>
          </div>
        </PremiumCard>
      )}

      {/* Channel stats */}
      {summary && summary.channelStats.length > 0 && (
        <PremiumCard title="إحصائيات القنوات" icon={Radio}>
          <div className="space-y-3">
            {summary.channelStats.map((ch) => (
              <div key={ch.channelId} className="flex items-center justify-between gap-4 p-4 bg-black/20 rounded-2xl border border-border/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
                    {ch.type === "youtube"
                      ? <Youtube className="w-4 h-4 text-red-400" />
                      : ch.type === "facebook"
                      ? <Facebook className="w-4 h-4 text-blue-400" />
                      : <Radio className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">{ch.channelName}</p>
                    <p className="text-[10px] text-muted-foreground/50">{ch.channelId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-foreground">
                    {ch.subscriberCount !== undefined ? ch.subscriberCount.toLocaleString("ar-EG") : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50">متابع</p>
                </div>
              </div>
            ))}
          </div>
        </PremiumCard>
      )}

      {/* Send report */}
      <div className="relative group rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20 shadow-inner">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground">إرسال التقرير</h3>
              <p className="text-xs text-muted-foreground mt-0.5">إرسال التقرير مباشرةً إلى تيليغرام</p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="معرّف المحادثة (Chat ID) — اتركه فارغاً للإرسال التلقائي"
              value={reportChatId}
              onChange={(e) => setReportChatId(e.target.value)}
              dir="ltr"
              className="flex-1 min-w-0 bg-black/40 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-mono shadow-inner placeholder:text-muted-foreground/40"
            />
            <PremiumButton onClick={sendReport} isLoading={sendingReport}>
              <Send className="w-4 h-4" />
              إرسال التقرير
            </PremiumButton>
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-3 leading-relaxed">
            💡 يمكنك إرسال <span className="font-bold text-primary">تقرير</span> في محادثة البوت مباشرةً للحصول على التقرير فوراً
          </p>
        </div>
      </div>

      {/* Recent records */}
      {summary && summary.recentRecords.length > 0 ? (
        <PremiumCard title="آخر المنشورات" icon={TrendingUp}>
          <div>
            {summary.recentRecords.map((rec) => (
              <RecordRow key={rec.id} record={rec} />
            ))}
          </div>
        </PremiumCard>
      ) : (
        <div className="rounded-[2rem] bg-card border border-border shadow-2xl p-12 text-center">
          <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-lg font-black text-muted-foreground/50 mb-2">لا توجد بيانات بعد</p>
          <p className="text-sm text-muted-foreground/40">ابدأ بنشر فيديوهات وستظهر الإحصائيات هنا تلقائياً</p>
        </div>
      )}
    </div>
  );
}
