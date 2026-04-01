import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import type { AppSettings } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Radio, Calendar, Clock, Send, Play, RefreshCw, Loader2,
  CheckCircle2, Bell, Zap, Globe, Download, Youtube, Facebook, Music2, SendHorizonal
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SchedulerStatus {
  running: boolean;
  lastScheduledPostDate: string;
  lastWeeklyReportDate: string;
}

interface SmartBotStatus {
  running: boolean;
  lastChannelCheckTime: number;
  channelStats: Array<{
    channelId: string;
    channelName: string;
    type: string;
    subscriberCount?: number;
    checkedAt: number;
  }>;
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface ConnectedChannels {
  youtube?: { channelId: string; channelName: string };
  facebook?: { pageId: string; pageName: string };
  tiktok?: { username: string };
}

export function SmartBot() {
  const { data: serverSettings } = useGetSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [smartBotStatus, setSmartBotStatus] = useState<SmartBotStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState<ConnectedChannels | null>(null);
  const [fetchingChannels, setFetchingChannels] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const saveTimer = { current: null as ReturnType<typeof setTimeout> | null };

  useEffect(() => {
    if (serverSettings) setSettings(serverSettings);
  }, [serverSettings]);

  const fetchStatuses = async () => {
    try {
      const [schRes, sbRes] = await Promise.all([
        fetch("/api/scheduler/status"),
        fetch("/api/smart-bot/status"),
      ]);
      setSchedulerStatus(await schRes.json());
      setSmartBotStatus(await sbRes.json());
    } catch {}
  };

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (updated: AppSettings) => {
    setSettings(updated);
    clearTimeout(saveTimer.current!);
    saveTimer.current = setTimeout(() => {
      updateSettings({ data: updated });
    }, 1000);
  };

  const triggerPost = async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/scheduler/trigger", { method: "POST" });
      const data = await res.json() as { success: boolean; message?: string; error?: string };
      if (data.success) {
        toast({ title: "✅ تم", description: data.message || "تم تشغيل المهمة" });
        await fetchStatuses();
      } else {
        toast({ title: "تنبيه", description: data.error || "لا توجد مهمة مجدوَلة الآن", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال", variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  };

  const fetchConnectedChannels = async () => {
    setFetchingChannels(true);
    try {
      const res = await fetch("/api/settings/connected-channels");
      const data = await res.json() as ConnectedChannels;
      setConnectedChannels(data);
      const parts: string[] = [];
      if (data.youtube?.channelId) parts.push(data.youtube.channelId);
      if (data.facebook?.pageId) parts.push(data.facebook.pageId);
      if (data.tiktok?.username) parts.push(`@${data.tiktok.username}`);
      if (parts.length > 0 && settings) {
        const current = settings.managedChannelIds?.trim();
        const merged = current
          ? [...new Set([...current.split(",").map(s => s.trim()), ...parts])].join(", ")
          : parts.join(", ");
        handleChange({ ...settings, managedChannelIds: merged });
        toast({ title: "✅ تم الجلب", description: `تمت إضافة ${parts.length} قناة/صفحة` });
      } else {
        toast({ title: "تنبيه", description: "لا توجد قنوات متصلة بمفاتيح API", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالسيرفر", variant: "destructive" });
    } finally {
      setFetchingChannels(false);
    }
  };

  const sendReportNow = async () => {
    if (!settings?.autoReportChatId) {
      toast({ title: "تنبيه", description: "أدخل Chat ID لاستقبال التقرير أولاً", variant: "destructive" });
      return;
    }
    setSendingReport(true);
    try {
      const res = await fetch("/api/analytics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: settings.autoReportChatId }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        toast({ title: "✅ أُرسل التقرير", description: "وصل التقرير لتيليغرام الآن" });
      } else {
        toast({ title: "خطأ", description: data.error || "فشل إرسال التقرير", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالسيرفر", variant: "destructive" });
    } finally {
      setSendingReport(false);
    }
  };

  if (!settings) {
    return <div className="animate-pulse h-[600px] bg-card rounded-[2rem]" />;
  }

  const dayOptions = [
    { value: "all", label: "كل يوم" },
    { value: "0", label: "الأحد" },
    { value: "1", label: "الاثنين" },
    { value: "2", label: "الثلاثاء" },
    { value: "3", label: "الأربعاء" },
    { value: "4", label: "الخميس" },
    { value: "5", label: "الجمعة" },
    { value: "6", label: "السبت" },
    { value: "0,5,6", label: "الجمعة والسبت والأحد" },
    { value: "1,2,3,4,5", label: "أيام العمل" },
  ];

  const langOptions = [
    { value: "en", label: "🇬🇧 الإنجليزية" },
    { value: "fr", label: "🇫🇷 الفرنسية" },
    { value: "ur", label: "🇵🇰 الأردية" },
    { value: "tr", label: "🇹🇷 التركية" },
    { value: "id", label: "🇮🇩 الإندونيسية" },
    { value: "ms", label: "🇲🇾 الملايوية" },
    { value: "de", label: "🇩🇪 الألمانية" },
    { value: "es", label: "🇪🇸 الإسبانية" },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black mb-1 sm:mb-2 tracking-tight text-foreground">البوت الذكي</h2>
          <p className="text-lg font-semibold text-muted-foreground">الإدارة التلقائية والجدولة والتقارير</p>
        </div>
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-primary/70 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            حفظ تلقائي...
          </div>
        )}
      </div>

      {/* Status banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={cn("rounded-2xl border p-5 flex items-center gap-4", schedulerStatus?.running ? "bg-green-500/10 border-green-500/25" : "bg-black/30 border-border/40")}>
          <div className={cn("p-2.5 rounded-xl", schedulerStatus?.running ? "bg-green-500/20 border border-green-500/30" : "bg-black/30 border border-border/40")}>
            <Clock className={cn("w-5 h-5", schedulerStatus?.running ? "text-green-400" : "text-muted-foreground/50")} />
          </div>
          <div>
            <p className="text-sm font-black text-foreground">الجدولة التلقائية</p>
            <p className={cn("text-xs font-bold", schedulerStatus?.running ? "text-green-400" : "text-muted-foreground/60")}>
              {schedulerStatus?.running ? "✓ تعمل — تفحص كل دقيقة" : "توقفت — شغّل البوت"}
            </p>
            {schedulerStatus?.lastScheduledPostDate && (
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">آخر نشر: {schedulerStatus.lastScheduledPostDate}</p>
            )}
          </div>
        </div>
        <div className={cn("rounded-2xl border p-5 flex items-center gap-4", settings.smartBotEnabled ? "bg-primary/10 border-primary/25" : "bg-black/30 border-border/40")}>
          <div className={cn("p-2.5 rounded-xl", settings.smartBotEnabled ? "bg-primary/20 border border-primary/30" : "bg-black/30 border border-border/40")}>
            <Brain className={cn("w-5 h-5", settings.smartBotEnabled ? "text-primary" : "text-muted-foreground/50")} />
          </div>
          <div>
            <p className="text-sm font-black text-foreground">البوت الذكي المستقل</p>
            <p className={cn("text-xs font-bold", settings.smartBotEnabled ? "text-primary" : "text-muted-foreground/60")}>
              {settings.smartBotEnabled ? "✓ مُفعَّل — يدير القنوات تلقائياً" : "غير مُفعَّل"}
            </p>
          </div>
        </div>
      </div>

      {/* Facebook Scheduled Posting */}
      <div className="relative rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center gap-4 p-6 sm:p-8 border-b border-border/50">
          <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 shadow-inner">
            <Calendar className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-foreground">النشر المجدوَل — فيسبوك</h3>
            <p className="text-xs text-muted-foreground mt-0.5">نشر دعاء اليوم تلقائياً يومياً بدون تدخل يدوي</p>
          </div>
          <div className="mr-auto">
            <Switch
              checked={settings.scheduledFbPostEnabled}
              onChange={(v) => handleChange({ ...settings, scheduledFbPostEnabled: v })}
            />
          </div>
        </div>
        <div className={cn("overflow-hidden transition-all duration-300", settings.scheduledFbPostEnabled ? "max-h-[400px]" : "max-h-0")}>
          <div className="p-6 sm:p-8 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  وقت النشر اليومي
                </label>
                <input
                  type="time"
                  value={settings.scheduledFbPostTime || "08:00"}
                  onChange={(e) => handleChange({ ...settings, scheduledFbPostTime: e.target.value })}
                  className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-mono shadow-inner"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  أيام النشر
                </label>
                <select
                  value={settings.scheduledFbPostDays || "all"}
                  onChange={(e) => handleChange({ ...settings, scheduledFbPostDays: e.target.value })}
                  className="w-full appearance-none bg-black/40 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-bold shadow-inner cursor-pointer"
                >
                  {dayOptions.map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-2xl flex items-start gap-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-foreground/70 leading-relaxed">
                يُولِّد البوت دعاء اليوم تلقائياً ويرسله لفيسبوك في الوقت المحدد.
                إن لم يكن هناك فيديو، يُنشر الدعاء كمنشور نصي.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <PremiumButton onClick={triggerPost} isLoading={triggering} variant="secondary">
                <Play className="w-4 h-4" />
                تشغيل الآن (اختبار)
              </PremiumButton>
            </div>
          </div>
        </div>
      </div>

      {/* YouTube Auto Captions */}
      <div className="relative rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center gap-4 p-6 sm:p-8 border-b border-border/50">
          <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20 shadow-inner">
            <Globe className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-foreground">Captions يوتيوب التلقائية</h3>
            <p className="text-xs text-muted-foreground mt-0.5">ترجمة الدعاء وإضافة ملفات SRT تلقائياً عند الرفع</p>
          </div>
          <div className="mr-auto">
            <Switch
              checked={settings.youtubeAutoCaption ?? false}
              onChange={(v) => handleChange({ ...settings, youtubeAutoCaption: v })}
            />
          </div>
        </div>
        <div className={cn("overflow-hidden transition-all duration-300", (settings.youtubeAutoCaption) ? "max-h-[300px]" : "max-h-0")}>
          <div className="p-6 sm:p-8 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70">لغة الترجمة (إضافة للعربية)</label>
              <select
                value={settings.captionTranslateLang || "en"}
                onChange={(e) => handleChange({ ...settings, captionTranslateLang: e.target.value })}
                className="w-full appearance-none bg-black/40 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-bold shadow-inner cursor-pointer"
              >
                {langOptions.map(o => (
                  <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                ))}
              </select>
            </div>
            <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-2xl flex items-start gap-2">
              <Globe className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-foreground/70 leading-relaxed">
                يُضيف البوت Captions عربية + الترجمة المحددة تلقائياً بعد كل رفع ناجح على يوتيوب.
                يستخدم Gemini AI للترجمة الأمينة.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Reports */}
      <PremiumCard title="التقارير التلقائية" icon={Bell}>
        <div className="space-y-1">
          <SettingRow
            label="تقرير أسبوعي تلقائي"
            hint="إرسال تقرير أسبوعي تلقائي إلى تيليغرام"
          >
            <Switch
              checked={settings.autoReportEnabled ?? false}
              onChange={(v) => handleChange({ ...settings, autoReportEnabled: v })}
            />
          </SettingRow>

          <SettingRow label="معرّف المحادثة (Chat ID)" hint="يُرسل إليه التقرير الأسبوعي ويمكن الإرسال الآن">
            <input
              type="text"
              placeholder="-1001234567890"
              value={settings.autoReportChatId || ""}
              onChange={(e) => handleChange({ ...settings, autoReportChatId: e.target.value })}
              dir="ltr"
              className="w-48 bg-black/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-all text-foreground text-xs font-mono shadow-inner placeholder:text-muted-foreground/40"
            />
          </SettingRow>

          {settings.autoReportEnabled && (
            <SettingRow label="يوم التقرير الأسبوعي" hint="اليوم الذي يُرسل فيه التقرير التلقائي">
              <select
                value={settings.weeklyReportDay ?? 5}
                onChange={(e) => handleChange({ ...settings, weeklyReportDay: parseInt(e.target.value) })}
                className="w-40 appearance-none bg-black/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-all text-foreground text-sm font-bold shadow-inner cursor-pointer"
              >
                <option value={0} className="bg-card">الأحد</option>
                <option value={1} className="bg-card">الاثنين</option>
                <option value={2} className="bg-card">الثلاثاء</option>
                <option value={3} className="bg-card">الأربعاء</option>
                <option value={4} className="bg-card">الخميس</option>
                <option value={5} className="bg-card">الجمعة</option>
                <option value={6} className="bg-card">السبت</option>
              </select>
            </SettingRow>
          )}
        </div>

        {/* Send Now button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={sendReportNow}
            disabled={sendingReport || !settings.autoReportChatId}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-lg shadow-primary/20",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            )}
          >
            {sendingReport
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإرسال...</>
              : <><SendHorizonal className="w-4 h-4" /> إرسال التقرير الآن</>
            }
          </button>
          <p className="text-xs text-muted-foreground/60 leading-tight">
            يُرسل ملخص التحليلات فوراً إلى Chat ID المدخل
          </p>
        </div>
      </PremiumCard>

      {/* Smart Bot Autonomous Management */}
      <div className="relative rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center gap-4 p-6 sm:p-8 border-b border-border/50">
          <div className="p-2.5 bg-gradient-to-br from-primary/20 to-accent/10 rounded-xl border border-primary/20 shadow-inner">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-black text-foreground">البوت الذكي المستقل</h3>
            <p className="text-xs text-muted-foreground mt-0.5">يعمل كمدير قنوات احترافي يسعى لزيادة الانتشار تلقائياً</p>
          </div>
          <div className="mr-auto">
            <Switch
              checked={settings.smartBotEnabled ?? false}
              onChange={(v) => handleChange({ ...settings, smartBotEnabled: v })}
            />
          </div>
        </div>
        <div className={cn("overflow-hidden transition-all duration-300", settings.smartBotEnabled ? "max-h-[900px]" : "max-h-0")}>
          <div className="p-6 sm:p-8 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-foreground/70">معرّفات القنوات المُدارة</label>
                <button
                  onClick={fetchConnectedChannels}
                  disabled={fetchingChannels}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                    "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 active:scale-95",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {fetchingChannels
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> جارٍ الجلب...</>
                    : <><Download className="w-3 h-3" /> جلب من المفاتيح</>
                  }
                </button>
              </div>

              {/* Connected channels chips (shown after fetch) */}
              {connectedChannels && (Object.keys(connectedChannels).length > 0) && (
                <div className="flex flex-wrap gap-2 py-1">
                  {connectedChannels.youtube && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] font-bold text-red-400">
                      <Youtube className="w-3 h-3 shrink-0" />
                      <span className="font-mono">{connectedChannels.youtube.channelId}</span>
                      <span className="text-red-400/60 font-normal">({connectedChannels.youtube.channelName})</span>
                    </div>
                  )}
                  {connectedChannels.facebook && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] font-bold text-blue-400">
                      <Facebook className="w-3 h-3 shrink-0" />
                      <span className="font-mono">{connectedChannels.facebook.pageId}</span>
                      <span className="text-blue-400/60 font-normal">({connectedChannels.facebook.pageName})</span>
                    </div>
                  )}
                  {connectedChannels.tiktok && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-pink-500/10 border border-pink-500/20 text-[11px] font-bold text-pink-400">
                      <Music2 className="w-3 h-3 shrink-0" />
                      <span className="font-mono">@{connectedChannels.tiktok.username}</span>
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={settings.managedChannelIds || ""}
                onChange={(e) => handleChange({ ...settings, managedChannelIds: e.target.value })}
                placeholder="@MyChannel, -1001234567890, @AnotherChannel"
                rows={3}
                className="w-full bg-black/40 border border-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none leading-relaxed font-mono"
                dir="ltr"
              />
              <p className="text-[10px] text-muted-foreground/40">افصل بين المعرّفات بفاصلة — يقبل @username أو Chat ID رقمي — اضغط "جلب من المفاتيح" لملء تلقائي من يوتيوب/فيسبوك/تيك توك</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70">معرّف المحادثة الإدارية (Chat ID)</label>
              <input
                type="text"
                placeholder="معرّفك الشخصي لاستقبال تقارير البوت الذكي"
                value={settings.smartBotAdminChatId || ""}
                onChange={(e) => handleChange({ ...settings, smartBotAdminChatId: e.target.value })}
                dir="ltr"
                className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-mono shadow-inner placeholder:text-muted-foreground/40"
              />
            </div>

            {/* Capabilities */}
            <div className="space-y-2 p-4 bg-black/20 rounded-2xl border border-border/30">
              <p className="text-xs font-bold text-foreground/70 mb-3">⚡ ما يفعله البوت الذكي تلقائياً:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  "📢 نشر دعاء يومي في القنوات (10 صباحاً)",
                  "📊 تحديث إحصائيات القنوات كل 6 ساعات",
                  "📩 إرسال تقرير مفصّل لك تلقائياً",
                  "🤖 توليد محتوى إسلامي ذكي لكل يوم",
                  "📈 مراقبة النمو والمتابعين",
                  "🔔 إشعارات فورية بأي تغير في الأداء",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground/70">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Channel stats */}
            {smartBotStatus && smartBotStatus.channelStats.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground/70">📡 القنوات المُراقَبة حالياً:</p>
                <div className="space-y-2">
                  {smartBotStatus.channelStats.map((ch) => (
                    <div key={ch.channelId} className="flex items-center justify-between gap-3 p-3 bg-black/20 rounded-xl border border-border/30">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold text-foreground">{ch.channelName}</span>
                      </div>
                      <span className="text-sm font-black text-primary">
                        {ch.subscriberCount !== undefined ? `${ch.subscriberCount.toLocaleString()} 👥` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <PremiumButton variant="secondary" onClick={fetchStatuses}>
                <RefreshCw className="w-4 h-4" />
                تحديث الحالة
              </PremiumButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
