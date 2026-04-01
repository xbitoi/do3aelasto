import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import type { AppSettings } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Radio, Calendar, Clock, Send, Play, RefreshCw, Loader2,
  CheckCircle2, Bell, Zap, Globe, Download, Youtube, Facebook, Music2, SendHorizonal,
  Trash2, Eye, AlertTriangle, X
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
  const [ytVideos, setYtVideos] = useState<Array<{ id: string; title: string; publishedAt: string; thumbnail: string; duration: string; views: number }> | null>(null);
  const [ytVideosLoading, setYtVideosLoading] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [deletingVideos, setDeletingVideos] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [ttVideos, setTtVideos] = useState<Array<{ id: string; title: string; cover: string; shareUrl: string; views: number; createdAt: string | null }> | null>(null);
  const [ttVideosLoading, setTtVideosLoading] = useState(false);
  const [selectedTtIds, setSelectedTtIds] = useState<Set<string>>(new Set());
  const [deletingTt, setDeletingTt] = useState(false);
  const [confirmTtDelete, setConfirmTtDelete] = useState(false);

  const [fbVideos, setFbVideos] = useState<Array<{ id: string; title: string; description: string; thumbnail: string; createdAt: string; views: number }> | null>(null);
  const [fbVideosLoading, setFbVideosLoading] = useState(false);
  const [selectedFbIds, setSelectedFbIds] = useState<Set<string>>(new Set());
  const [deletingFb, setDeletingFb] = useState(false);
  const [confirmFbDelete, setConfirmFbDelete] = useState(false);
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

  const loadYtVideos = async () => {
    setYtVideosLoading(true);
    setSelectedVideoIds(new Set());
    try {
      const res = await fetch("/api/youtube/videos");
      const data = await res.json() as { videos?: typeof ytVideos; error?: string };
      if (data.error) {
        toast({ title: "خطأ", description: data.error, variant: "destructive" });
      } else {
        setYtVideos(data.videos ?? []);
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر جلب الفيديوهات", variant: "destructive" });
    } finally {
      setYtVideosLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedVideoIds.size === 0) return;
    setDeletingVideos(true);
    setConfirmDelete(false);
    try {
      const res = await fetch("/api/youtube/delete-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: Array.from(selectedVideoIds) }),
      });
      const data = await res.json() as { deleted: string[]; failed: Array<{ id: string; error: string }> };
      if (data.deleted?.length > 0) {
        toast({ title: "✅ تم الحذف", description: `تم حذف ${data.deleted.length} فيديو بنجاح` });
        setYtVideos(prev => prev?.filter(v => !data.deleted.includes(v.id)) ?? null);
        setSelectedVideoIds(new Set());
      }
      if (data.failed?.length > 0) {
        toast({ title: "⚠️ بعض الحذف فشل", description: `فشل حذف ${data.failed.length} فيديو`, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحذف", variant: "destructive" });
    } finally {
      setDeletingVideos(false);
    }
  };

  const toggleVideoSelect = (id: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadTtVideos = async () => {
    setTtVideosLoading(true);
    setSelectedTtIds(new Set());
    try {
      const res = await fetch("/api/tiktok/videos");
      const data = await res.json() as { videos?: typeof ttVideos; error?: string };
      if (data.error) toast({ title: "خطأ", description: data.error, variant: "destructive" });
      else setTtVideos(data.videos ?? []);
    } catch {
      toast({ title: "خطأ", description: "تعذّر جلب فيديوهات تيك توك", variant: "destructive" });
    } finally { setTtVideosLoading(false); }
  };

  const handleDeleteTt = async () => {
    if (selectedTtIds.size === 0) return;
    setDeletingTt(true);
    setConfirmTtDelete(false);
    try {
      const res = await fetch("/api/tiktok/delete-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: Array.from(selectedTtIds) }),
      });
      const data = await res.json() as { deleted: string[]; failed: Array<{ id: string; error: string }> };
      if (data.deleted?.length > 0) {
        toast({ title: "✅ تم الحذف", description: `تم حذف ${data.deleted.length} فيديو بنجاح` });
        setTtVideos(prev => prev?.filter(v => !data.deleted.includes(v.id)) ?? null);
        setSelectedTtIds(new Set());
      }
      if (data.failed?.length > 0) toast({ title: "⚠️ بعض الحذف فشل", description: `فشل حذف ${data.failed.length} فيديو`, variant: "destructive" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحذف", variant: "destructive" });
    } finally { setDeletingTt(false); }
  };

  const loadFbVideos = async () => {
    setFbVideosLoading(true);
    setSelectedFbIds(new Set());
    try {
      const res = await fetch("/api/facebook/videos");
      const data = await res.json() as { videos?: typeof fbVideos; error?: string };
      if (data.error) toast({ title: "خطأ", description: data.error, variant: "destructive" });
      else setFbVideos(data.videos ?? []);
    } catch {
      toast({ title: "خطأ", description: "تعذّر جلب فيديوهات فيسبوك", variant: "destructive" });
    } finally { setFbVideosLoading(false); }
  };

  const handleDeleteFb = async () => {
    if (selectedFbIds.size === 0) return;
    setDeletingFb(true);
    setConfirmFbDelete(false);
    try {
      const res = await fetch("/api/facebook/delete-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: Array.from(selectedFbIds) }),
      });
      const data = await res.json() as { deleted: string[]; failed: Array<{ id: string; error: string }> };
      if (data.deleted?.length > 0) {
        toast({ title: "✅ تم الحذف", description: `تم حذف ${data.deleted.length} فيديو بنجاح` });
        setFbVideos(prev => prev?.filter(v => !data.deleted.includes(v.id)) ?? null);
        setSelectedFbIds(new Set());
      }
      if (data.failed?.length > 0) toast({ title: "⚠️ بعض الحذف فشل", description: `فشل حذف ${data.failed.length} فيديو`, variant: "destructive" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحذف", variant: "destructive" });
    } finally { setDeletingFb(false); }
  };

  const triggerPost = async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/scheduler/force-trigger", { method: "POST" });
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
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-primary" />
                أسلوب الدعاء
              </label>
              <select
                value={settings.scheduledDuaaStyle || "عشوائي"}
                onChange={(e) => handleChange({ ...settings, scheduledDuaaStyle: e.target.value })}
                className="w-full appearance-none bg-black/40 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-bold shadow-inner cursor-pointer"
              >
                <option value="عشوائي" className="bg-card">🎲 عشوائي — يتغير في كل نشر</option>
                <option value="تضرع وخشوع" className="bg-card">تضرع وخشوع</option>
                <option value="شكر وحمد" className="bg-card">شكر وحمد</option>
                <option value="استغفار" className="bg-card">استغفار</option>
                <option value="رجاء وأمل" className="bg-card">رجاء وأمل</option>
                <option value="توكل وثقة" className="bg-card">توكل وثقة</option>
                <option value="دعاء الصباح" className="bg-card">دعاء الصباح</option>
                <option value="دعاء المساء" className="bg-card">دعاء المساء</option>
              </select>
            </div>
            <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-2xl flex items-start gap-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-foreground/70 leading-relaxed">
                يُولِّد البوت دعاء اليوم تلقائياً وينشره كمنشور نصي على فيسبوك في الوقت المحدد — بدون فيديو.
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

      {/* ── YouTube Video Management ── */}
      <div className="relative rounded-[2rem] bg-card border border-red-500/20 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-4 p-6 sm:p-8 border-b border-border/50">
          <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20 shadow-inner">
            <Youtube className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-foreground">إدارة فيديوهات يوتيوب</h3>
            <p className="text-xs text-muted-foreground mt-0.5">عرض وحذف فيديوهات قناتك مباشرة من هنا</p>
          </div>
          <PremiumButton variant="secondary" onClick={loadYtVideos} isLoading={ytVideosLoading}>
            <Eye className="w-4 h-4" />
            تحميل الفيديوهات
          </PremiumButton>
        </div>

        {ytVideos !== null && (
          <div className="p-6 sm:p-8 space-y-4">
            {/* Bulk Delete Toolbar */}
            {ytVideos.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => {
                    if (selectedVideoIds.size === ytVideos.length) {
                      setSelectedVideoIds(new Set());
                    } else {
                      setSelectedVideoIds(new Set(ytVideos.map(v => v.id)));
                    }
                  }}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border/50 rounded-xl hover:border-border transition-all"
                >
                  {selectedVideoIds.size === ytVideos.length ? "إلغاء التحديد" : "تحديد الكل"}
                </button>

                {selectedVideoIds.size > 0 && !confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف المحدد ({selectedVideoIds.size})
                  </button>
                )}

                {confirmDelete && (
                  <div className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-500/30 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-400">تأكيد حذف {selectedVideoIds.size} فيديو؟ لا يمكن التراجع!</span>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={deletingVideos}
                      className="flex items-center gap-1.5 text-xs font-black bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-all disabled:opacity-50"
                    >
                      {deletingVideos ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      نعم، احذف
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <span className="text-xs text-muted-foreground/50 mr-auto">{ytVideos.length} فيديو في آخر 25</span>
              </div>
            )}

            {/* Video List */}
            {ytVideos.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground/40 text-sm">لا توجد فيديوهات في القناة</div>
            ) : (
              <div className="divide-y divide-border/30 rounded-2xl border border-border/30 overflow-hidden">
                {ytVideos.map((v) => {
                  const isSelected = selectedVideoIds.has(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => toggleVideoSelect(v.id)}
                      className={cn(
                        "flex items-center gap-3 w-full text-right p-3 hover:bg-white/[0.03] transition-all",
                        isSelected && "bg-red-500/10 border-l-2 border-l-red-500"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all",
                        isSelected ? "bg-red-500 border-red-500" : "border-border/50"
                      )}>
                        {isSelected && <span className="text-white text-xs font-black">✓</span>}
                      </div>
                      {v.thumbnail && (
                        <img src={v.thumbnail} alt={v.title} className="w-20 h-12 rounded-lg object-cover border border-border/30 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-bold text-foreground line-clamp-1">{v.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{v.views.toLocaleString("en-US")}</span>
                          <span>{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("ar-EG") : "—"}</span>
                        </div>
                      </div>
                      <a
                        href={`https://youtu.be/${v.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] text-red-400 hover:text-red-300 border border-red-500/20 px-2 py-1 rounded-lg shrink-0"
                      >
                        ↗ عرض
                      </a>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TikTok Video Management ── */}
      <div className="relative rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
          <div className="flex items-center gap-4 p-6 sm:p-8 border-b border-border/50">
            <div className="p-2.5 bg-black/20 rounded-xl border border-border/40 shadow-inner">
              <Music2 className="w-5 h-5 text-foreground/70" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-foreground">إدارة فيديوهات تيك توك</h3>
              <p className="text-xs text-muted-foreground mt-0.5">عرض وحذف فيديوهات حسابك مباشرة من هنا</p>
            </div>
            <PremiumButton variant="secondary" onClick={loadTtVideos} isLoading={ttVideosLoading}>
              <Eye className="w-4 h-4" />
              تحميل الفيديوهات
            </PremiumButton>
          </div>

          {ttVideos !== null && (
            <div className="p-6 sm:p-8 space-y-4">
              {ttVideos.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setSelectedTtIds(prev => prev.size === ttVideos.length ? new Set() : new Set(ttVideos.map(v => v.id)))}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border/50 rounded-xl hover:border-border transition-all"
                  >
                    {selectedTtIds.size === ttVideos.length ? "إلغاء التحديد" : "تحديد الكل"}
                  </button>
                  {selectedTtIds.size > 0 && !confirmTtDelete && (
                    <button
                      onClick={() => setConfirmTtDelete(true)}
                      className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف المحدد ({selectedTtIds.size})
                    </button>
                  )}
                  {confirmTtDelete && (
                    <div className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-500/30 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-xs font-bold text-red-400">تأكيد حذف {selectedTtIds.size} فيديو؟ لا يمكن التراجع!</span>
                      <button onClick={handleDeleteTt} disabled={deletingTt} className="flex items-center gap-1.5 text-xs font-black bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-all disabled:opacity-50">
                        {deletingTt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        نعم، احذف
                      </button>
                      <button onClick={() => setConfirmTtDelete(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground/50 mr-auto">{ttVideos.length} فيديو</span>
                </div>
              )}
              {ttVideos.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground/40 text-sm">لا توجد فيديوهات في الحساب</div>
              ) : (
                <div className="divide-y divide-border/30 rounded-2xl border border-border/30 overflow-hidden">
                  {ttVideos.map((v) => {
                    const isSelected = selectedTtIds.has(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedTtIds(prev => { const n = new Set(prev); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n; })}
                        className={cn("flex items-center gap-3 w-full text-right p-3 hover:bg-white/[0.03] transition-all", isSelected && "bg-red-500/10 border-l-2 border-l-red-500")}
                      >
                        <div className={cn("w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all", isSelected ? "bg-red-500 border-red-500" : "border-border/50")}>
                          {isSelected && <span className="text-white text-xs font-black">✓</span>}
                        </div>
                        {v.cover && <img src={v.cover} alt={v.title} className="w-14 h-14 rounded-lg object-cover border border-border/30 shrink-0" />}
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-bold text-foreground line-clamp-1">{v.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{v.views.toLocaleString("en-US")}</span>
                            {v.createdAt && <span>{new Date(v.createdAt).toLocaleDateString("ar-EG")}</span>}
                          </div>
                        </div>
                        <a href={v.shareUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-foreground/50 hover:text-foreground border border-border/30 px-2 py-1 rounded-lg shrink-0">↗ عرض</a>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
      </div>

      {/* ── Facebook Video Management ── */}
      <div className="relative rounded-[2rem] bg-card border border-blue-500/20 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-4 p-6 sm:p-8 border-b border-border/50">
          <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 shadow-inner">
            <Facebook className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-foreground">إدارة فيديوهات فيسبوك</h3>
            <p className="text-xs text-muted-foreground mt-0.5">عرض وحذف فيديوهات صفحتك مباشرة من هنا</p>
          </div>
          <PremiumButton variant="secondary" onClick={loadFbVideos} isLoading={fbVideosLoading}>
            <Eye className="w-4 h-4" />
            تحميل الفيديوهات
          </PremiumButton>
        </div>

        {fbVideos !== null && (
          <div className="p-6 sm:p-8 space-y-4">
            {fbVideos.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setSelectedFbIds(prev => prev.size === fbVideos.length ? new Set() : new Set(fbVideos.map(v => v.id)))}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border/50 rounded-xl hover:border-border transition-all"
                >
                  {selectedFbIds.size === fbVideos.length ? "إلغاء التحديد" : "تحديد الكل"}
                </button>
                {selectedFbIds.size > 0 && !confirmFbDelete && (
                  <button
                    onClick={() => setConfirmFbDelete(true)}
                    className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف المحدد ({selectedFbIds.size})
                  </button>
                )}
                {confirmFbDelete && (
                  <div className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-500/30 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-400">تأكيد حذف {selectedFbIds.size} فيديو؟ لا يمكن التراجع!</span>
                    <button onClick={handleDeleteFb} disabled={deletingFb} className="flex items-center gap-1.5 text-xs font-black bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-all disabled:opacity-50">
                      {deletingFb ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      نعم، احذف
                    </button>
                    <button onClick={() => setConfirmFbDelete(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <span className="text-xs text-muted-foreground/50 mr-auto">{fbVideos.length} فيديو</span>
              </div>
            )}
            {fbVideos.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground/40 text-sm">لا توجد فيديوهات في الصفحة</div>
            ) : (
              <div className="divide-y divide-border/30 rounded-2xl border border-border/30 overflow-hidden">
                {fbVideos.map((v) => {
                  const isSelected = selectedFbIds.has(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedFbIds(prev => { const n = new Set(prev); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n; })}
                      className={cn("flex items-center gap-3 w-full text-right p-3 hover:bg-white/[0.03] transition-all", isSelected && "bg-red-500/10 border-l-2 border-l-red-500")}
                    >
                      <div className={cn("w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all", isSelected ? "bg-red-500 border-red-500" : "border-border/50")}>
                        {isSelected && <span className="text-white text-xs font-black">✓</span>}
                      </div>
                      {v.thumbnail && <img src={v.thumbnail} alt={v.title} className="w-20 h-12 rounded-lg object-cover border border-border/30 shrink-0" />}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-bold text-foreground line-clamp-1">{v.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{v.views.toLocaleString("en-US")}</span>
                          {v.createdAt && <span>{new Date(v.createdAt).toLocaleDateString("ar-EG")}</span>}
                        </div>
                      </div>
                      <a href={`https://www.facebook.com/video/${v.id}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-blue-400 hover:text-blue-300 border border-blue-500/20 px-2 py-1 rounded-lg shrink-0">↗ عرض</a>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
