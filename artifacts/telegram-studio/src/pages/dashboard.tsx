import { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings, useStartBot, useStopBot, useTestBot, useGetBotStatus } from "@workspace/api-client-react";
import type { AppSettings, BotStatus, LogEntry } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Input, Slider, ColorPicker, Select, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Activity, Key, Paintbrush, Save, LayoutTemplate, Palette, Mic2, Server, ChevronDown, RefreshCw, Bot, Volume2, Loader2, Youtube, Facebook, Share2, CheckCircle2, XCircle, Wifi, FileText, Send } from "lucide-react";
import { cn } from "@/lib/utils";

function ApiKeysCard({ isRunning, onStart, onStop, onTest, isTesting, isStarting, isStopping }: any) {
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('geminiKey') || '');
  const [groqKey, setGroqKey] = useState(localStorage.getItem('groqKey') || '');
  const [botToken, setBotToken] = useState(localStorage.getItem('botToken') || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('geminiKey', geminiKey);
    localStorage.setItem('groqKey', groqKey);
    localStorage.setItem('botToken', botToken);
  }, [geminiKey, groqKey, botToken]);

  return (
    <div className="relative group rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <button
        onClick={() => setOpen(!open)}
        className="relative z-10 w-full flex items-center justify-between gap-4 p-6 sm:p-8 text-right hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20 shadow-inner">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-xl font-black text-foreground tracking-tight">مفاتيح API والتحكم</h3>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>

      <div className={cn("overflow-hidden transition-all duration-300", open ? "max-h-[600px]" : "max-h-0")}>
        <div className="relative z-10 px-6 sm:px-8 pb-6 sm:pb-8 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground/70 ml-1 block">مفتاح Gemini AI</label>
            <Input type="password" placeholder="AIzaSy..." value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground/70 ml-1 block">
              مفتاح Groq AI
              <span className="text-xs text-muted-foreground font-normal mr-2">(احتياطي عند فشل Gemini)</span>
            </label>
            <Input type="password" placeholder="gsk_..." value={groqKey} onChange={(e) => setGroqKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground/70 ml-1 block">توكن بوت تيليغرام</label>
            <Input type="password" placeholder="123456789:AA..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <PremiumButton onClick={() => onStart(geminiKey, botToken, groqKey)} disabled={isRunning} isLoading={isStarting}>
              <Play className="w-4 h-4" />
              تشغيل
            </PremiumButton>
            <PremiumButton variant="destructive" onClick={onStop} disabled={!isRunning} isLoading={isStopping}>
              <Square className="w-4 h-4 fill-current" />
              إيقاف
            </PremiumButton>
          </div>
          <PremiumButton variant="secondary" onClick={() => onTest(botToken)} isLoading={isTesting} className="w-full">
            <Server className="w-4 h-4" />
            اختبار الاتصال
          </PremiumButton>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

// ── Social Media Card ──────────────────────────────────────────────────────

interface PlatformStatus {
  loading: boolean;
  success?: boolean;
  info?: string;
  error?: string;
}

function PlatformStatusBadge({ status }: { status: PlatformStatus }) {
  if (status.loading) {
    return (
      <span className="flex items-center gap-1 text-xs text-primary font-bold">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        جاري الاختبار...
      </span>
    );
  }
  if (status.success === true) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 font-bold">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {status.info}
      </span>
    );
  }
  if (status.success === false) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-400 font-bold">
        <XCircle className="w-3.5 h-3.5" />
        {status.error}
      </span>
    );
  }
  return null;
}

function SocialMediaCard({ settings, setSettings, onSave, isSaving }: any) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const [ytStatus, setYtStatus] = useState<PlatformStatus>({ loading: false });
  const [fbStatus, setFbStatus] = useState<PlatformStatus>({ loading: false });
  const [ttStatus, setTtStatus] = useState<PlatformStatus>({ loading: false });

  const testPlatform = async (platform: "youtube" | "facebook" | "tiktok") => {
    const token = platform === "youtube" ? settings?.youtubeToken
      : platform === "facebook" ? settings?.facebookToken
      : settings?.tiktokToken;

    if (!token?.trim()) {
      toast({ title: "تنبيه", description: "أدخل التوكن أولاً", variant: "destructive" });
      return;
    }

    const setStatus = platform === "youtube" ? setYtStatus : platform === "facebook" ? setFbStatus : setTtStatus;
    setStatus({ loading: true });

    try {
      const res = await fetch(`/api/social/test-${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (data.success) {
        let info = "";
        if (platform === "youtube") info = `${data.channelName}${data.subscribers ? ` · ${data.subscribers} مشترك` : ""}`;
        if (platform === "facebook") info = `${data.pageName}${data.followers ? ` · ${data.followers} متابع` : ""}`;
        if (platform === "tiktok") info = `${data.displayName || data.username}${data.followers ? ` · ${data.followers} متابع` : ""}`;
        setStatus({ loading: false, success: true, info });
        toast({ title: "✅ تم التحقق بنجاح", description: info });
      } else {
        setStatus({ loading: false, success: false, error: data.error || "فشل الاختبار" });
        toast({ title: "❌ فشل الاختبار", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      setStatus({ loading: false, success: false, error: "خطأ في الاتصال" });
    }
  };

  if (!settings) return null;

  const activePlatforms = [
    settings.youtubeToken && "يوتيوب",
    settings.facebookToken && "فيسبوك",
    settings.tiktokToken && "تيك توك",
  ].filter(Boolean);

  return (
    <div className="relative group rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-blue-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <button
        onClick={() => setOpen(!open)}
        className="relative z-10 w-full flex items-center justify-between gap-4 p-6 sm:p-8 text-right hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-gradient-to-br from-red-500/20 to-pink-500/10 rounded-xl border border-red-500/20 shadow-inner">
            <Share2 className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex flex-col items-start">
            <h3 className="text-xl font-black text-foreground tracking-tight">منصات النشر الاجتماعي</h3>
            {activePlatforms.length > 0 ? (
              <span className="text-xs text-green-400 font-bold mt-0.5">{activePlatforms.join(" · ")} — جاهز للنشر</span>
            ) : (
              <span className="text-xs text-muted-foreground/60 font-medium mt-0.5">أرسل "نشر" في تيليغرام للنشر التلقائي</span>
            )}
          </div>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>

      <div className={cn("overflow-hidden transition-all duration-500", open ? "max-h-[900px]" : "max-h-0")}>
        <div className="relative z-10 px-6 sm:px-8 pb-6 sm:pb-8 space-y-5">

          {/* Usage hint */}
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3">
            <Send className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-foreground/70 leading-relaxed">
              أرسل كلمة <span className="text-primary font-black">نشر</span> في محادثة البوت لنشر آخر فيديو تم دمجه تلقائياً على المنصات المُفعَّلة مع الدعاء كعنوان.
            </p>
          </div>

          {/* YouTube */}
          <div className="space-y-3 p-4 rounded-2xl bg-black/30 border border-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/20">
                  <Youtube className="w-4 h-4 text-red-500" />
                </div>
                <span className="text-sm font-black text-foreground">يوتيوب</span>
                {settings.youtubeToken && <span className="text-[10px] text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">مُفعَّل</span>}
              </div>
              <button
                onClick={() => testPlatform("youtube")}
                disabled={ytStatus.loading}
                className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
              >
                <Wifi className="w-3 h-3" />
                اختبار
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground/70 block">OAuth2 Access Token</label>
              <Input
                type="password"
                placeholder="ya29.a0AfB_..."
                value={settings.youtubeToken || ""}
                onChange={(e: any) => setSettings({ ...settings, youtubeToken: e.target.value })}
              />
            </div>

            {(ytStatus.loading || ytStatus.success !== undefined) && (
              <PlatformStatusBadge status={ytStatus} />
            )}

            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              احصل على التوكن من <span className="text-primary font-mono">Google OAuth2 Playground</span> مع نطاق
              <span className="font-mono"> youtube.upload</span>
            </p>
          </div>

          {/* Facebook */}
          <div className="space-y-3 p-4 rounded-2xl bg-black/30 border border-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-600/15 border border-blue-600/20">
                  <Facebook className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-sm font-black text-foreground">فيسبوك</span>
                {settings.facebookToken && <span className="text-[10px] text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">مُفعَّل</span>}
              </div>
              <button
                onClick={() => testPlatform("facebook")}
                disabled={fbStatus.loading}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
              >
                <Wifi className="w-3 h-3" />
                اختبار
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground/70 block">Page Access Token</label>
              <Input
                type="password"
                placeholder="EAABwzLixnjYBO..."
                value={settings.facebookToken || ""}
                onChange={(e: any) => setSettings({ ...settings, facebookToken: e.target.value })}
              />
            </div>

            {(fbStatus.loading || fbStatus.success !== undefined) && (
              <PlatformStatusBadge status={fbStatus} />
            )}

            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              احصل على التوكن من <span className="text-primary font-mono">Meta for Developers</span> → Graph API Explorer مع صلاحية <span className="font-mono">pages_manage_posts</span>
            </p>
          </div>

          {/* TikTok */}
          <div className="space-y-3 p-4 rounded-2xl bg-black/30 border border-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-pink-500/15 border border-pink-500/20">
                  <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.28 8.28 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z"/>
                  </svg>
                </div>
                <span className="text-sm font-black text-foreground">تيك توك</span>
                {settings.tiktokToken && <span className="text-[10px] text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">مُفعَّل</span>}
              </div>
              <button
                onClick={() => testPlatform("tiktok")}
                disabled={ttStatus.loading}
                className="flex items-center gap-1.5 text-xs font-bold text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
              >
                <Wifi className="w-3 h-3" />
                اختبار
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground/70 block">Content Posting Access Token</label>
              <Input
                type="password"
                placeholder="act.example..."
                value={settings.tiktokToken || ""}
                onChange={(e: any) => setSettings({ ...settings, tiktokToken: e.target.value })}
              />
            </div>

            {(ttStatus.loading || ttStatus.success !== undefined) && (
              <PlatformStatusBadge status={ttStatus} />
            )}

            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              احصل على التوكن من <span className="text-primary font-mono">TikTok for Developers</span> → Content Posting API مع صلاحية <span className="font-mono">video.publish</span>
            </p>
          </div>

          {/* Description field */}
          <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/15">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/20">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-black text-foreground">نص الوصف الإضافي</span>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">يُضاف أسفل الدعاء في وصف جميع المنصات</p>
              </div>
            </div>

            <textarea
              value={settings.publishDescription || ""}
              onChange={(e) => setSettings({ ...settings, publishDescription: e.target.value })}
              placeholder="مثال: قناتنا للدعاء والذكر | لا تنسى المتابعة والمشاركة 🤲&#10;#دعاء #إسلام #قرآن"
              rows={4}
              className="w-full bg-black/40 border border-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none leading-relaxed font-medium"
              dir="rtl"
            />

            <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
              <span>يظهر في الوصف: 🤲 {"{الدعاء}"} ━━━━ {settings.publishDescription ? "{نصك}" : "(لا يوجد نص إضافي)"}</span>
              <span>{(settings.publishDescription || "").length} حرف</span>
            </div>
          </div>

          <PremiumButton onClick={onSave} isLoading={isSaving} className="w-full">
            <Save className="w-4 h-4" />
            حفظ إعدادات النشر
          </PremiumButton>
        </div>
      </div>
    </div>
  );
}

function DesignSettingsCard({ settings, setSettings, onSave, isSaving }: any) {
  const [tab, setTab] = useState<'text' | 'color' | 'audio'>('text');
  const [models, setModels] = useState<string[]>(DEFAULT_GEMINI_MODELS);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [previewingAudio, setPreviewingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const handleAudioPreview = async () => {
    if (previewingAudio) {
      audioRef.current?.pause();
      setPreviewingAudio(false);
      return;
    }
    setPreviewingAudio(true);
    try {
      const voice = settings.ttsVoice || "ar-SA-HamedNeural";
      const slow = settings.ttsSpeed ? "true" : "false";
      const url = `/api/tts-preview?voice=${encodeURIComponent(voice)}&slow=${slow}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPreviewingAudio(false);
      audio.onerror = () => {
        setPreviewingAudio(false);
        toast({ title: "خطأ", description: "تعذّر تحميل معاينة الصوت", variant: "destructive" });
      };
      await audio.play();
    } catch {
      setPreviewingAudio(false);
      toast({ title: "خطأ", description: "تعذّر تشغيل معاينة الصوت", variant: "destructive" });
    }
  };

  const handleFetchModels = async () => {
    const geminiKey = localStorage.getItem('geminiKey') || '';
    if (!geminiKey) {
      toast({ title: "تنبيه", description: "أدخل مفتاح Gemini أولاً في قسم المفاتيح", variant: "destructive" });
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch(`/api/gemini-models?geminiKey=${encodeURIComponent(geminiKey)}`);
      const data = await res.json();
      if (data.models?.length) {
        setModels(data.models);
        toast({ title: "✅ تم جلب النماذج", description: `${data.models.length} نموذج متاح لمفتاحك` });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر جلب النماذج، تحقق من المفتاح", variant: "destructive" });
    } finally {
      setFetchingModels(false);
    }
  };

  if (!settings) return <PremiumCard><div className="animate-pulse h-[400px] bg-black/20 rounded-2xl" /></PremiumCard>;

  return (
    <PremiumCard title="المظهر والصوت" icon={Paintbrush}>
      <div className="flex gap-2 mb-8 bg-black/40 p-1.5 rounded-2xl border border-border/50 shadow-inner">
        <button onClick={() => setTab('text')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", tab === 'text' ? "bg-card shadow-lg text-primary border border-border/50" : "text-muted-foreground hover:text-foreground")}>
          <LayoutTemplate className="w-4 h-4" /> النص
        </button>
        <button onClick={() => setTab('color')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", tab === 'color' ? "bg-card shadow-lg text-primary border border-border/50" : "text-muted-foreground hover:text-foreground")}>
          <Palette className="w-4 h-4" /> الألوان
        </button>
        <button onClick={() => setTab('audio')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", tab === 'audio' ? "bg-card shadow-lg text-primary border border-border/50" : "text-muted-foreground hover:text-foreground")}>
          <Mic2 className="w-4 h-4" /> الصوت
        </button>
      </div>

      <div className="space-y-4 min-h-[300px]">
        {tab === 'text' && (
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             <Select label="نوع الخط" value={settings.font} onChange={(v: string) => setSettings({...settings, font: v})} options={[
               {label: "BeIn - القاهرة الحديث", value: "BeIn"},
               {label: "Boutros - كلاسيكي", value: "Boutros"},
               {label: "Dima - قرآني", value: "Dima"},
               {label: "Takeaway - عصري", value: "Takeaway"}
             ]} />
             <Slider label="حجم الخط" min={20} max={150} step={1} value={settings.fontSize} onChange={(v: number) => setSettings({...settings, fontSize: v})} unit="px" />
             <Slider label="الموضع العمودي" min={10} max={95} step={1} value={settings.yPosition} onChange={(v: number) => setSettings({...settings, yPosition: v})} unit="%" />
             <Slider label="ارتفاع السطر" min={1.0} max={3.0} step={0.1} value={settings.lineHeight} onChange={(v: number) => setSettings({...settings, lineHeight: v})} unit="x" />
             <Slider label="سُمك الحدود" min={0} max={10} step={1} value={settings.strokeThickness} onChange={(v: number) => setSettings({...settings, strokeThickness: v})} unit="px" />

             <div className="pt-3 border-t border-border/50 space-y-4">
               <p className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">✨ تأثيرات الحركة</p>
               <Select label="🔤 تأثير ظهور الكلمات" value={settings.wordEffect ?? "random"} onChange={(v: string) => setSettings({...settings, wordEffect: v})} options={[
                 {label: "عشوائي 🎲", value: "random"},
                 {label: "تلاشي ناعم", value: "fade_smooth"},
                 {label: "تكبير بوب", value: "zoom_pop"},
                 {label: "ارتداد نابضي", value: "bounce_spring"},
                 {label: "صعود من الأسفل", value: "slide_up"},
                 {label: "نزول من الأعلى", value: "slide_down"},
                 {label: "دخول انسيابي", value: "swing_right"},
                 {label: "وميض متنفس", value: "glow_pulse"},
                 {label: "كشف من اليمين", value: "reveal_rtl"},
               ]} />
               <Select label="🎞 تأثير الانتقال بين الفيديوهات" value={settings.transitionEffect ?? "random"} onChange={(v: string) => setSettings({...settings, transitionEffect: v})} options={[
                 {label: "عشوائي 🎲", value: "random"},
                 {label: "تلاشي متقاطع", value: "crossfade"},
                 {label: "انزلاق لليسار", value: "slide_left"},
                 {label: "انزلاق لليمين", value: "slide_right"},
                 {label: "انزلاق للأعلى", value: "slide_up"},
                 {label: "تلاشي للأسود", value: "fade_black"},
                 {label: "تكبير وتلاشي", value: "zoom"},
                 {label: "مسح قطري", value: "wipe"},
               ]} />
               <p className="text-[10px] text-muted-foreground/50 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
                 💡 يُطبَّق تأثير الانتقال فعلياً بين المقاطع عند الدمج — اختر <span className="text-primary font-bold">عشوائي</span> لتنوع تلقائي
               </p>
             </div>
           </div>
        )}
        
        {tab === 'color' && (
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             <ColorPicker label="لون النص الأساسي" value={settings.textColor} onChange={(v: string) => setSettings({...settings, textColor: v})} />
             <ColorPicker label="لون الكلمة النشطة" value={settings.activeColor} onChange={(v: string) => setSettings({...settings, activeColor: v})} />
           </div>
        )}
        
        {tab === 'audio' && (
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             <Select label="أسلوب الدعاء" value={settings.duaaStyle} onChange={(v: string) => setSettings({...settings, duaaStyle: v})} options={[
               {label: "تضرع وخشوع", value: "تضرع وخشوع"},
               {label: "شكر وحمد", value: "شكر وحمد"},
               {label: "استغفار", value: "استغفار"},
               {label: "رجاء وأمل", value: "رجاء وأمل"},
               {label: "توكل وثقة", value: "توكل وثقة"}
             ]} />

             <div className="space-y-2">
               <label className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
                 <Mic2 className="w-3.5 h-3.5 text-primary" />
                 الصوت المُستخدم
               </label>
               <div className="space-y-1.5">
                 <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">أصوات ذكور — عميقة للخشوع</p>
                 <div className="grid grid-cols-1 gap-1.5">
                   {[
                     { value: "ar-SA-HamedNeural",  label: "حامد", desc: "سعودي — غليظ خاشع (الافتراضي)" },
                     { value: "ar-EG-ShakirNeural",  label: "شاكر", desc: "مصري — رنّان دافئ" },
                     { value: "ar-KW-FahedNeural",   label: "فهد",  desc: "خليجي — هادئ وقور" },
                     { value: "ar-IQ-BasselNeural",  label: "باسل", desc: "عراقي — عميق مؤثر" },
                   ].map((v) => (
                     <button
                       key={v.value}
                       onClick={() => setSettings({...settings, ttsVoice: v.value})}
                       className={cn(
                         "flex items-center gap-3 w-full text-right px-3 py-2 rounded-xl border transition-all text-sm",
                         (settings.ttsVoice || "ar-SA-HamedNeural") === v.value
                           ? "border-primary bg-primary/15 text-foreground shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                           : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                       )}
                     >
                       <span className={cn("text-lg", (settings.ttsVoice || "ar-SA-HamedNeural") === v.value ? "opacity-100" : "opacity-40")}>🎙️</span>
                       <span className="flex flex-col items-start">
                         <span className="font-black text-sm">{v.label}</span>
                         <span className="text-[11px] opacity-70">{v.desc}</span>
                       </span>
                       {(settings.ttsVoice || "ar-SA-HamedNeural") === v.value && (
                         <span className="mr-auto text-primary text-xs font-black">✓</span>
                       )}
                     </button>
                   ))}
                 </div>

                 <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest pt-1">أصوات إناث</p>
                 <div className="grid grid-cols-1 gap-1.5">
                   {[
                     { value: "ar-EG-SalmaNeural",   label: "سلمى",  desc: "مصرية — ناعمة خاشعة" },
                     { value: "ar-SA-ZariyahNeural",  label: "زارية", desc: "سعودية — هادئة روحانية" },
                   ].map((v) => (
                     <button
                       key={v.value}
                       onClick={() => setSettings({...settings, ttsVoice: v.value})}
                       className={cn(
                         "flex items-center gap-3 w-full text-right px-3 py-2 rounded-xl border transition-all text-sm",
                         settings.ttsVoice === v.value
                           ? "border-pink-500/60 bg-pink-500/10 text-foreground shadow-[0_0_12px_rgba(236,72,153,0.15)]"
                           : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                       )}
                     >
                       <span className={cn("text-lg", settings.ttsVoice === v.value ? "opacity-100" : "opacity-40")}>🎤</span>
                       <span className="flex flex-col items-start">
                         <span className="font-black text-sm">{v.label}</span>
                         <span className="text-[11px] opacity-70">{v.desc}</span>
                       </span>
                       {settings.ttsVoice === v.value && (
                         <span className="mr-auto text-pink-400 text-xs font-black">✓</span>
                       )}
                     </button>
                   ))}
                 </div>
               </div>
             </div>

             <div className="pt-3 border-t border-border/50 space-y-2">
               <div className="flex items-center justify-between gap-2">
                 <label className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
                   <Bot className="w-3.5 h-3.5 text-primary" />
                   موديل Gemini للنص
                 </label>
                 <button
                   onClick={handleFetchModels}
                   disabled={fetchingModels}
                   className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                 >
                   <RefreshCw className={cn("w-3 h-3", fetchingModels && "animate-spin")} />
                   {fetchingModels ? "جاري الجلب..." : "جلب من مفتاحك"}
                 </button>
               </div>
               <select
                 value={settings.geminiModel || "auto"}
                 onChange={(e) => setSettings({...settings, geminiModel: e.target.value})}
                 className="w-full appearance-none bg-black/40 border border-border rounded-xl px-4 py-2.5 pl-10 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-bold shadow-inner cursor-pointer hover:border-border/80"
               >
                 <option value="auto" className="bg-card">🤖 تلقائي (أفضل موديل متاح)</option>
                 {models.map((m) => (
                   <option key={m} value={m} className="bg-card font-mono">{m}</option>
                 ))}
               </select>
               {(settings.geminiModel && settings.geminiModel !== "auto") && (
                 <p className="text-xs text-primary/70 font-semibold">
                   ✓ سيُستخدم <span className="font-mono">{settings.geminiModel}</span> أولاً
                 </p>
               )}
             </div>

             <div className="pt-3 border-t border-border/50 space-y-4">
               <Switch label="تخفيض سرعة القراءة (لزيادة الوضوح)" checked={settings.ttsSpeed} onChange={(v: boolean) => setSettings({...settings, ttsSpeed: v})} />
             </div>

             <div className="pt-3 border-t border-border/50 space-y-3">
               <p className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
                 <Volume2 className="w-3.5 h-3.5 text-primary" />
                 التحكم في مستوى الصوت
               </p>
               <Slider
                 label="صوت الدعاء"
                 min={50}
                 max={200}
                 step={5}
                 value={settings.duaaVolume ?? 120}
                 onChange={(v: number) => setSettings({...settings, duaaVolume: v})}
                 unit="%"
               />
               <Slider
                 label="صوت الفيديو الأصلي"
                 min={0}
                 max={150}
                 step={5}
                 value={settings.originalVolume ?? 90}
                 onChange={(v: number) => setSettings({...settings, originalVolume: v})}
                 unit="%"
               />
               <div className="text-[11px] text-muted-foreground/60 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
                 الدعاء: <span className="text-primary font-bold">{settings.duaaVolume ?? 120}%</span>
                 &nbsp;·&nbsp; الأصلي: <span className="text-foreground/70 font-bold">{settings.originalVolume ?? 90}%</span>
                 &nbsp;·&nbsp; الفرق: <span className="text-green-400 font-bold">+{(settings.duaaVolume ?? 120) - (settings.originalVolume ?? 90)}%</span>
               </div>
             </div>

             <div className="pt-3 border-t border-border/50">
               <button
                 onClick={handleAudioPreview}
                 className={cn(
                   "flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-sm border transition-all",
                   previewingAudio
                     ? "bg-primary/20 border-primary text-primary shadow-[0_0_16px_rgba(99,102,241,0.3)]"
                     : "bg-black/30 border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                 )}
               >
                 {previewingAudio ? (
                   <>
                     <Loader2 className="w-4 h-4 animate-spin" />
                     يتم التشغيل... (اضغط للإيقاف)
                   </>
                 ) : (
                   <>
                     <Volume2 className="w-4 h-4" />
                     معاينة صوت الدعاء
                   </>
                 )}
               </button>
               <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
                 يُشغّل نموذج صوتي قصير بالصوت والسرعة المحددة
               </p>
             </div>
           </div>
        )}
      </div>

      <PremiumButton onClick={onSave} isLoading={isSaving} className="w-full mt-6">
        <Save className="w-4 h-4" />
        حفظ الإعدادات
      </PremiumButton>
    </PremiumCard>
  )
}

function StatusCard({ status }: { status?: BotStatus }) {
  const isRunning = status?.running || false;
  
  return (
    <PremiumCard className="bg-gradient-to-br from-card via-card to-primary/5">
      <div className="flex flex-col sm:flex-row gap-8 justify-between items-center">
        
        <div className="flex flex-col items-center sm:items-start flex-1">
          <p className="text-sm font-bold text-muted-foreground mb-3">حالة البوت</p>
          <div className="flex items-center gap-3 bg-black/30 px-5 py-3 rounded-2xl border border-white/5 shadow-inner w-full justify-center sm:justify-start">
            <span className="relative flex h-3.5 w-3.5">
              {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
              <span className={cn("relative inline-flex rounded-full h-3.5 w-3.5", isRunning ? "bg-success shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-destructive")}></span>
            </span>
            <span className={cn("text-lg font-black tracking-wide", isRunning ? "text-success" : "text-destructive")}>
              {isRunning ? "يعمل" : "متوقف"}
            </span>
          </div>
        </div>
        
        <div className="h-20 w-px bg-border/80 hidden sm:block"></div>
        
        <div className="flex flex-col items-center sm:items-start flex-1">
          <p className="text-sm font-bold text-muted-foreground mb-3">فيديوهات مُعالجة</p>
          <div className="flex items-center justify-center sm:justify-start bg-black/30 px-5 py-3 rounded-2xl border border-white/5 shadow-inner w-full">
            <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              {status?.processedCount || 0}
            </span>
          </div>
        </div>

        <div className="h-20 w-px bg-border/80 hidden sm:block"></div>
        
        <div className="flex flex-col items-center sm:items-start flex-1">
          <p className="text-sm font-bold text-muted-foreground mb-3">معلومات الاتصال</p>
          <div className="flex flex-col justify-center sm:justify-start bg-black/30 px-5 py-3 rounded-2xl border border-white/5 shadow-inner w-full min-h-[64px]">
            {status?.botName ? (
              <>
                <span className="text-base font-black text-foreground truncate w-full text-center sm:text-start">{status.botName}</span>
                <span className="text-sm text-primary font-mono truncate w-full text-center sm:text-start">@{status.botUsername}</span>
              </>
            ) : (
               <span className="text-muted-foreground font-bold italic w-full text-center sm:text-start">غير متصل</span>
            )}
          </div>
        </div>

      </div>
    </PremiumCard>
  )
}

const FONT_FAMILY_MAP: Record<string, string> = {
  BeIn: "'BeIn', 'Cairo', sans-serif",
  Boutros: "'Boutros', 'Cairo', sans-serif",
  Dima: "'Dima', 'Cairo', sans-serif",
  Takeaway: "'Takeaway', 'Cairo', sans-serif",
};

function PreviewCard({ settings }: { settings: AppSettings | null }) {
  if (!settings) return null;

  const PREVIEW_W = 216;
  const PREVIEW_H = Math.round(PREVIEW_W * (16 / 9));
  const scale = PREVIEW_W / 1080;

  const previewFontSize = Math.max(8, Math.round(settings.fontSize * scale));
  const previewStroke = Math.max(0, Math.round(settings.strokeThickness * scale));
  const yPercent = settings.yPosition;

  const fontFamily = FONT_FAMILY_MAP[settings.font] ?? "'Cairo', sans-serif";

  return (
    <PremiumCard title="معاينة — ريلز فيسبوك (9:16)" icon={LayoutTemplate}>
      <div className="flex flex-col items-center gap-5">
        <div
          className="relative overflow-hidden rounded-2xl border-2 border-border/60 shadow-[0_0_40px_rgba(0,0,0,0.8)] flex-shrink-0"
          style={{ width: PREVIEW_W, height: PREVIEW_H, background: "#0a0a0a" }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:12px_12px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-green-950/30" />
          <div className="absolute top-0 inset-x-0 h-5 bg-black/50 flex items-center justify-center">
            <div className="w-12 h-1 bg-white/20 rounded-full" />
          </div>

          {settings.showBackground && (
            <div
              className="absolute inset-x-0 h-16 bg-black"
              style={{
                top: `calc(${yPercent}% - 32px)`,
                opacity: (settings.bgOpacity ?? 40) / 100,
                filter: "blur(8px)",
              }}
            />
          )}

          <div
            className="absolute inset-x-0 flex justify-center"
            style={{ top: `${yPercent}%`, transform: "translateY(-50%)" }}
          >
            <div
              dir="rtl"
              style={{
                fontFamily,
                fontSize: previewFontSize,
                lineHeight: settings.lineHeight,
                color: settings.textColor,
                WebkitTextStroke: previewStroke > 0 ? `${previewStroke}px rgba(0,0,0,0.95)` : undefined,
                textShadow: "0 2px 6px rgba(0,0,0,0.9)",
                textAlign: "center",
                padding: "0 8px",
                maxWidth: "100%",
              }}
            >
              <span>اللَّهُمَّ </span>
              <span
                style={{
                  color: settings.activeColor,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  padding: "0 4px",
                  borderRadius: "6px",
                  boxShadow: `0 0 12px ${settings.activeColor}60`,
                  borderBottom: `1px solid ${settings.activeColor}80`,
                }}
              >
                إِنَّا
              </span>
              <span> نَسْأَلُكَ رَحْمَتَكَ</span>
            </div>
          </div>

          <div className="absolute bottom-5 inset-x-0 flex flex-col items-start px-3 gap-1">
            <div className="w-16 h-1.5 bg-white/25 rounded-full" />
            <div className="w-10 h-1.5 bg-white/15 rounded-full" />
          </div>

          <div className="absolute top-6 left-2 text-[7px] font-black text-white/60 bg-black/40 px-1.5 py-0.5 rounded-md tracking-widest">
            REELS
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground w-full max-w-xs">
          <span className="font-bold">الخط:</span>
          <span className="text-foreground/80 font-semibold">{settings.font}</span>
          <span className="font-bold">الحجم:</span>
          <span className="text-foreground/80 font-semibold">{settings.fontSize}px</span>
          <span className="font-bold">الموضع:</span>
          <span className="text-foreground/80 font-semibold">{settings.yPosition}%</span>
          <span className="font-bold">لون النص:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ background: settings.textColor }} />
            <span className="text-foreground/80 font-mono">{settings.textColor}</span>
          </span>
          <span className="font-bold">لون النشط:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ background: settings.activeColor }} />
            <span className="text-foreground/80 font-mono">{settings.activeColor}</span>
          </span>
        </div>

        <p className="text-center text-xs font-bold text-muted-foreground/60">
          الكلمة الملونة تُضاء بالتزامن مع الصوت أثناء التشغيل الفعلي
        </p>
      </div>
    </PremiumCard>
  );
}

function LogsCard({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <PremiumCard title="سجل العمليات المباشر" icon={Activity} className="flex flex-col flex-1 h-full min-h-[400px]">
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-[#02040A] border border-border/80 rounded-2xl p-6 font-mono text-sm space-y-3 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)]"
      >
        {logs.length === 0 && (
          <div className="text-muted-foreground/40 text-center h-full flex flex-col items-center justify-center gap-4">
             <Activity className="w-10 h-10 opacity-20" />
             <span className="font-bold tracking-wide">في انتظار بدء البوت واستقبال المقاطع...</span>
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-4 border-b border-white/5 pb-3 last:border-0 hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors">
            <span className="text-muted-foreground/50 shrink-0 w-20 font-bold">[{log.time}]</span>
            <span className={cn(
              "leading-relaxed tracking-wide",
              log.level === 'success' && 'text-success font-bold drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]',
              log.level === 'error' && 'text-destructive font-bold drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]',
              log.level === 'warning' && 'text-warning font-semibold',
              log.level === 'info' && 'text-info font-semibold',
              log.level === 'processing' && 'text-accent font-bold animate-pulse',
            )}>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </PremiumCard>
  );
}

export function Dashboard() {
  const { data: status, refetch: refetchStatus } = useGetBotStatus({
    query: { refetchInterval: 3000 }
  });
  const { data: serverSettings } = useGetSettings();
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateSettings();
  const { mutate: startBot, isPending: isStarting } = useStartBot();
  const { mutate: stopBot, isPending: isStopping } = useStopBot();
  const { mutate: testBot, isPending: isTesting } = useTestBot();
  const { toast } = useToast();

  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (serverSettings && !settings) {
      setSettings(serverSettings);
    }
  }, [serverSettings]);

  const isRunning = status?.running || false;

  const handleStart = (geminiKey: string, botToken: string, groqKey?: string) => {
    if (!geminiKey || !botToken) {
      toast({ title: "تنبيه", description: "الرجاء إدخال المفاتيح أولاً في لوحة التحكم", variant: "destructive" });
      return;
    }
    startBot({ data: { geminiKey, botToken, groqKey: groqKey || "" } }, {
      onSuccess: (res) => {
        if (res.success) {
          toast({ title: "نجاح التشغيل", description: res.message });
          refetchStatus();
        } else {
          toast({ title: "خطأ في التفعيل", description: res.message, variant: "destructive" });
        }
      }
    });
  }

  const handleStop = () => {
    stopBot(undefined, {
      onSuccess: (res) => {
        toast({ title: "إيقاف", description: res.message });
        refetchStatus();
      }
    });
  }

  const handleTest = (botToken: string) => {
    if (!botToken) {
      toast({ title: "تنبيه", description: "الرجاء إدخال توكن البوت لاختبار الاتصال" });
      return;
    }
    testBot({ data: { botToken } }, {
      onSuccess: (res) => {
        if (res.success) toast({ title: "تم الاتصال بنجاح", description: `البوت متصل: ${res.botName}` });
        else toast({ title: "فشل الاتصال", description: res.error, variant: "destructive" });
      }
    });
  }

  const handleSaveSettings = () => {
    if (settings) {
      updateSettings({ data: settings }, {
        onSuccess: () => toast({ title: "تم", description: "حُفظت الإعدادات والتنسيقات بنجاح" })
      });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      <div className="lg:col-span-5 space-y-8 lg:space-y-10">
        <ApiKeysCard 
          isRunning={isRunning} 
          onStart={handleStart} 
          onStop={handleStop} 
          onTest={handleTest}
          isStarting={isStarting}
          isStopping={isStopping}
          isTesting={isTesting}
        />
        <DesignSettingsCard 
          settings={settings} 
          setSettings={setSettings} 
          onSave={handleSaveSettings} 
          isSaving={isUpdating} 
        />
        <SocialMediaCard
          settings={settings}
          setSettings={setSettings}
          onSave={handleSaveSettings}
          isSaving={isUpdating}
        />
      </div>
      
      <div className="lg:col-span-7 flex flex-col gap-8 lg:gap-10 h-full">
        <PreviewCard settings={settings} />
        <StatusCard status={status} />
        <LogsCard logs={status?.logs || []} />
      </div>
    </div>
  )
}
