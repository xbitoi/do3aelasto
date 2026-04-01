import { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings, useGetBotStatus } from "@workspace/api-client-react";
import type { AppSettings, BotStatus, LogEntry } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Slider, ColorPicker, Select, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { Activity, Paintbrush, LayoutTemplate, Palette, Mic2, ChevronDown, RefreshCw, Bot, Volume2, VolumeX, Loader2, Share2, FileText, Send, MessageCircle, Wifi, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

function BotStatusMiniCard({ status, onSendWelcome, isSendingWelcome }: { status?: BotStatus; onSendWelcome: () => void; isSendingWelcome: boolean }) {
  const isRunning = status?.running || false;
  return (
    <div className="relative group rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className={cn("p-2.5 rounded-xl border shadow-inner transition-colors", isRunning ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30")}>
            <Wifi className={cn("w-5 h-5", isRunning ? "text-success" : "text-destructive")} />
          </div>
          <div>
            <h3 className="text-xl font-black text-foreground tracking-tight">البوت التلقائي</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="relative flex h-2.5 w-2.5">
                {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />}
                <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", isRunning ? "bg-success" : "bg-destructive")} />
              </span>
              <span className={cn("text-sm font-bold", isRunning ? "text-success" : "text-destructive")}>
                {isRunning ? `يعمل — ${status?.botName || ""}` : "متوقف — أضف المفاتيح من الإعدادات المتقدمة"}
              </span>
            </div>
          </div>
        </div>
        <PremiumButton variant="secondary" onClick={onSendWelcome} isLoading={isSendingWelcome} disabled={!isRunning}>
          <MessageCircle className="w-4 h-4" />
          إرسال ترحيب
        </PremiumButton>
      </div>
      <p className="relative z-10 mt-4 text-[11px] text-muted-foreground/50 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
        🤖 يبدأ البوت تلقائياً عند تشغيل التطبيق — أدخل المفاتيح من <span className="text-primary font-bold">الإعدادات المتقدمة</span> لتفعيله
      </p>
    </div>
  );
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

function _unused_PlatformStatusBadge({ status }: { status: { loading: boolean; success?: boolean; info?: string; error?: string } }) {
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

function SocialMediaCard({ settings, setSettings, isSaving }: any) {
  const [open, setOpen] = useState(false);

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
            <h3 className="text-xl font-black text-foreground tracking-tight">النشر الاجتماعي</h3>
            {activePlatforms.length > 0 ? (
              <span className="text-xs text-green-400 font-bold mt-0.5">{activePlatforms.join(" · ")} — جاهز للنشر</span>
            ) : (
              <span className="text-xs text-muted-foreground/60 font-medium mt-0.5">أضف التوكنات من الإعدادات المتقدمة</span>
            )}
          </div>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>

      <div className={cn("overflow-hidden transition-all duration-500", open ? "max-h-[400px]" : "max-h-0")}>
        <div className="relative z-10 px-6 sm:px-8 pb-6 sm:pb-8 space-y-4">

          <div className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3">
            <Send className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-foreground/70 leading-relaxed">
              أرسل كلمة <span className="text-primary font-black">نشر</span> في محادثة البوت لنشر آخر فيديو تلقائياً. أدخل التوكنات من <span className="text-primary font-bold">الإعدادات المتقدمة</span>.
            </p>
          </div>

          {/* Active platforms status */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "youtubeToken", label: "يوتيوب", color: "red" },
              { key: "facebookToken", label: "فيسبوك", color: "blue" },
              { key: "tiktokToken", label: "تيك توك", color: "pink" },
            ].map(({ key, label, color }) => (
              <div key={key} className={cn("flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center", settings[key] ? `bg-${color}-500/10 border-${color}-500/20` : "bg-black/20 border-border/30")}>
                <span className={cn("text-[10px] font-black", settings[key] ? "text-green-400" : "text-muted-foreground/50")}>{settings[key] ? "✓ مُفعَّل" : "غير مُفعَّل"}</span>
                <span className="text-xs font-bold text-foreground/70">{label}</span>
              </div>
            ))}
          </div>

          {/* Description field */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              نص الوصف الإضافي
            </label>
            <textarea
              value={settings.publishDescription || ""}
              onChange={(e) => setSettings({ ...settings, publishDescription: e.target.value })}
              placeholder="مثال: قناتنا للدعاء والذكر | #دعاء #إسلام"
              rows={3}
              className="w-full bg-black/40 border border-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none leading-relaxed font-medium"
              dir="rtl"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/40">
              <span>يُضاف أسفل الدعاء في وصف جميع المنصات</span>
              <span>{(settings.publishDescription || "").length} حرف</span>
            </div>
          </div>

          {isSaving && (
            <div className="flex items-center justify-center gap-2 text-xs text-primary/70 font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              جاري الحفظ التلقائي...
            </div>
          )}
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
  const [textSizesOpen, setTextSizesOpen] = useState(false);
  const [aspectRatioOpen, setAspectRatioOpen] = useState(false);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
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
      <div className="flex gap-2 mb-8 bg-primary/5 p-1.5 rounded-2xl border border-primary/15 shadow-inner">
        <button onClick={() => setTab('text')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", tab === 'text' ? "bg-gradient-to-r from-primary/90 to-accent/80 shadow-lg text-white" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
          <LayoutTemplate className="w-4 h-4" /> النص
        </button>
        <button onClick={() => setTab('color')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", tab === 'color' ? "bg-gradient-to-r from-pink-500/80 to-violet-500/80 shadow-lg text-white" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
          <Palette className="w-4 h-4" /> الألوان
        </button>
        <button onClick={() => setTab('audio')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", tab === 'audio' ? "bg-gradient-to-r from-emerald-500/80 to-teal-500/80 shadow-lg text-white" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
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

             {/* Collapsible: font size & position */}
             <button
               onClick={() => setTextSizesOpen(!textSizesOpen)}
               className="flex items-center justify-between w-full py-2 px-3 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-all text-xs font-bold text-foreground/80"
             >
               <span className="flex items-center gap-2">
                 <span>⚙️</span>
                 <span>الحجم والموضع والحدود</span>
               </span>
               <span className={cn("transition-transform duration-200 text-primary", textSizesOpen ? "rotate-180" : "")}>▼</span>
             </button>
             {textSizesOpen && (
               <div className="space-y-4 pl-2 border-r border-primary/20 pr-3 animate-in fade-in slide-in-from-top-2 duration-200">
                 <Slider label="حجم الخط" min={20} max={150} step={1} value={settings.fontSize} onChange={(v: number) => setSettings({...settings, fontSize: v})} unit="px" />
                 <Slider label="الموضع العمودي" min={10} max={95} step={1} value={settings.yPosition} onChange={(v: number) => setSettings({...settings, yPosition: v})} unit="%" />
                 <Slider label="ارتفاع السطر" min={1.0} max={3.0} step={0.1} value={settings.lineHeight} onChange={(v: number) => setSettings({...settings, lineHeight: v})} unit="x" />
                 <Slider label="سُمك الحدود" min={0} max={10} step={1} value={settings.strokeThickness} onChange={(v: number) => setSettings({...settings, strokeThickness: v})} unit="px" />
               </div>
             )}

             <div className="pt-3 border-t border-primary/20 space-y-3">
               <p className="text-xs font-bold text-primary/80 flex items-center gap-1.5">
                 <Layers className="w-3.5 h-3.5 text-primary" />
                 خلفية النص
               </p>
               <Switch
                 label="تفعيل خلفية النص"
                 checked={settings.showBackground ?? true}
                 onChange={(v: boolean) => setSettings({...settings, showBackground: v})}
               />
               {(settings.showBackground ?? true) && (
                 <>
                   <Slider
                     label="كثافة الخلفية"
                     min={5} max={100} step={5}
                     value={settings.bgOpacity ?? 40}
                     onChange={(v: number) => setSettings({...settings, bgOpacity: v})}
                     unit="%"
                   />
                 </>
               )}
             </div>

             <div className="pt-3 border-t border-accent/20 space-y-3">
               <button
                 onClick={() => setAspectRatioOpen(!aspectRatioOpen)}
                 className="flex items-center justify-between w-full py-2 px-3 rounded-xl bg-accent/5 border border-accent/20 hover:bg-accent/10 transition-all text-xs font-bold text-foreground/80"
               >
                 <span className="flex items-center gap-2">
                   <span>📐</span>
                   <span>نسبة العرض للارتفاع — <span className="text-accent font-black">{settings.aspectRatio ?? "9:16"}</span></span>
                 </span>
                 <span className={cn("transition-transform duration-200 text-accent", aspectRatioOpen ? "rotate-180" : "")}>▼</span>
               </button>
               {aspectRatioOpen && (
                 <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                   <div className="grid grid-cols-2 gap-2">
                     {[
                       {label: "9:16", desc: "ريلز / شورتس", icon: "📱"},
                       {label: "16:9", desc: "يوتيوب عادي", icon: "🖥️"},
                       {label: "1:1", desc: "مربع / إنستغرام", icon: "⬜"},
                       {label: "4:5", desc: "فيسبوك / إنستغرام", icon: "📲"},
                     ].map((r) => (
                       <button
                         key={r.label}
                         onClick={() => setSettings({...settings, aspectRatio: r.label})}
                         className={cn(
                           "flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all text-sm",
                           (settings.aspectRatio || "9:16") === r.label
                             ? "border-primary bg-primary/15 text-foreground shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                             : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                         )}
                       >
                         <span className="text-lg">{r.icon}</span>
                         <span className="font-black text-sm">{r.label}</span>
                         <span className="text-[10px] opacity-70">{r.desc}</span>
                       </button>
                     ))}
                   </div>
                   <p className="text-[10px] text-muted-foreground/50 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
                     📱 <span className="text-primary font-bold">9:16</span> مثالي للريلز والشورتس — يُطبَّق عند معالجة الفيديو
                   </p>
                 </div>
               )}
             </div>

             <div className="pt-3 border-t border-warning/20 space-y-4">
               <p className="text-xs font-bold text-warning/80 flex items-center gap-1.5">✨ تأثيرات الحركة</p>
               <Select label="🔤 تأثير ظهور الكلمات" value={settings.wordEffect ?? "random"} onChange={(v: string) => setSettings({...settings, wordEffect: v})} options={[
                 {label: "عشوائي 🎲", value: "random"},
                 {label: "بدون تأثير ⛔", value: "none"},
                 {label: "تلاشي ناعم ✨", value: "fade_smooth"},
                 {label: "تكبير بوب 💥", value: "zoom_pop"},
                 {label: "ارتداد نابضي 🏀", value: "bounce_spring"},
                 {label: "صعود من الأسفل ⬆️", value: "slide_up"},
                 {label: "نزول من الأعلى ⬇️", value: "slide_down"},
                 {label: "دخول انسيابي 🌊", value: "swing_right"},
                 {label: "وميض متنفس 💫", value: "glow_pulse"},
                 {label: "كشف من اليمين 🪟", value: "reveal_rtl"},
                 {label: "كاتب آلي ⌨️", value: "typewriter"},
                 {label: "موجة متتالية 〰️", value: "wave_cascade"},
                 {label: "مصفوفة رقمية 🔢", value: "matrix_rain"},
                 {label: "بريق متحرك ✦", value: "shimmer"},
                 {label: "دوران ثلاثي 🌀", value: "spin_in"},
                 {label: "تشابك حروف 🔀", value: "scramble"},
               ]} />
               <Select label="🎞 تأثير الانتقال بين الفيديوهات" value={settings.transitionEffect ?? "random"} onChange={(v: string) => setSettings({...settings, transitionEffect: v})} options={[
                 {label: "عشوائي 🎲", value: "random"},
                 {label: "بدون انتقال ⛔", value: "none"},
                 {label: "تلاشي متقاطع", value: "crossfade"},
                 {label: "انزلاق لليسار", value: "slide_left"},
                 {label: "انزلاق لليمين", value: "slide_right"},
                 {label: "انزلاق للأعلى", value: "slide_up"},
                 {label: "تلاشي للأسود", value: "fade_black"},
                 {label: "تكبير وتلاشي", value: "zoom"},
                 {label: "مسح قطري", value: "wipe"},
                 {label: "إضاءة ومضية ⚡", value: "flash"},
                 {label: "دوامة لولبية 🌀", value: "spiral"},
                 {label: "تقشير الزاوية 📄", value: "corner_peel"},
                 {label: "تكسير زجاجي 🪟", value: "shatter"},
               ]} />
               <Slider
                 label="مدة تأثير الانتقال"
                 min={0} max={4} step={0.1}
                 value={settings.transitionDuration ?? 0.5}
                 onChange={(v: number) => setSettings({...settings, transitionDuration: v})}
                 unit="ث"
               />
               <p className="text-[10px] text-muted-foreground/50 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
                 💡 يُطبَّق تأثير الانتقال فعلياً بين المقاطع عند الدمج — اختر <span className="text-primary font-bold">عشوائي</span> لتنوع تلقائي
               </p>
             </div>
           </div>
        )}
        
        {tab === 'color' && (
           <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
             <ColorPicker label="لون النص الأساسي" value={settings.textColor} onChange={(v: string) => setSettings({...settings, textColor: v})} />
             <ColorPicker label="لون الكلمة النشطة" value={settings.activeColor} onChange={(v: string) => setSettings({...settings, activeColor: v})} />

             {(settings.showBackground ?? true) && (
               <div className="pt-3 border-t border-border/50 space-y-3">
                 <p className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
                   <Layers className="w-3.5 h-3.5 text-primary" />
                   لون خلفية الكلمة النشطة
                 </p>

                 {/* Mode toggle */}
                 <div className="grid grid-cols-3 gap-2">
                   <button
                     onClick={() => setSettings({...settings, bgColorMode: "fixed"})}
                     className={cn(
                       "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                       (settings.bgColorMode ?? "fixed") === "fixed"
                         ? "border-primary bg-primary/15 text-primary shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                         : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                     )}
                   >🎨 لون محدد</button>
                   <button
                     onClick={() => setSettings({...settings, bgColorMode: "random"})}
                     className={cn(
                       "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                       (settings.bgColorMode ?? "fixed") === "random"
                         ? "border-amber-500/70 bg-amber-500/15 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                         : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                     )}
                   >🎲 عشوائي</button>
                   <button
                     onClick={() => setSettings({...settings, bgColorMode: "none"})}
                     className={cn(
                       "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                       (settings.bgColorMode ?? "fixed") === "none"
                         ? "border-destructive/70 bg-destructive/15 text-destructive shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                         : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                     )}
                   >⛔ توقف</button>
                 </div>

                 {(settings.bgColorMode ?? "fixed") === "fixed" && (
                   <>
                     {/* Preset palette */}
                     <div className="grid grid-cols-5 gap-2">
                       {[
                         { color: "#6366F1", label: "بنفسجي" },
                         { color: "#3B82F6", label: "أزرق" },
                         { color: "#10B981", label: "أخضر" },
                         { color: "#F59E0B", label: "ذهبي" },
                         { color: "#EF4444", label: "أحمر" },
                         { color: "#8B5CF6", label: "بنفسجي غامق" },
                         { color: "#EC4899", label: "وردي" },
                         { color: "#06B6D4", label: "سماوي" },
                         { color: "#F97316", label: "برتقالي" },
                         { color: "#FFFFFF", label: "أبيض" },
                       ].map((p) => (
                         <button
                           key={p.color}
                           title={p.label}
                           onClick={() => setSettings({...settings, bgColor: p.color})}
                           className={cn(
                             "w-full aspect-square rounded-xl border-2 transition-all hover:scale-110",
                             (settings.bgColor ?? "#3B82F6") === p.color
                               ? "border-white scale-110 shadow-lg"
                               : "border-transparent"
                           )}
                           style={{ backgroundColor: p.color }}
                         />
                       ))}
                     </div>
                     <ColorPicker label="لون مخصص" value={settings.bgColor ?? "#3B82F6"} onChange={(v: string) => setSettings({...settings, bgColor: v})} />
                   </>
                 )}

                 {(settings.bgColorMode ?? "fixed") === "random" && (
                   <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
                     <span className="text-lg">🎲</span>
                     <p className="text-xs text-foreground/70 leading-relaxed">
                       سيطبق <span className="text-amber-400 font-black">لون مختلف</span> عشوائياً على خلفية الكلمة في كل فيديو — تنوع تلقائي بكل معالجة
                     </p>
                   </div>
                 )}
               </div>
             )}

             {/* Shadow color section */}
             <div className="pt-3 border-t border-border/50 space-y-3">
               <p className="text-xs font-bold text-foreground/70 flex items-center gap-1.5">
                 <Layers className="w-3.5 h-3.5 text-info" />
                 لون ظل النص
               </p>
               <div className="grid grid-cols-3 gap-2">
                 <button
                   onClick={() => setSettings({...settings, shadowColorMode: "fixed"})}
                   className={cn(
                     "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                     (settings.shadowColorMode ?? "fixed") === "fixed"
                       ? "border-info/70 bg-info/15 text-info shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                       : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                   )}
                 >🌑 لون محدد</button>
                 <button
                   onClick={() => setSettings({...settings, shadowColorMode: "random"})}
                   className={cn(
                     "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                     (settings.shadowColorMode ?? "fixed") === "random"
                       ? "border-amber-500/70 bg-amber-500/15 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                       : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                   )}
                 >🎲 عشوائي</button>
                 <button
                   onClick={() => setSettings({...settings, shadowColorMode: "none"})}
                   className={cn(
                     "py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                     (settings.shadowColorMode ?? "fixed") === "none"
                       ? "border-destructive/70 bg-destructive/15 text-destructive shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                       : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                   )}
                 >⛔ توقف</button>
               </div>
               {(settings.shadowColorMode ?? "fixed") === "fixed" && (
                 <>
                   <div className="grid grid-cols-5 gap-2">
                     {[
                       { color: "#000000", label: "أسود" },
                       { color: "#1E1B4B", label: "كحلي" },
                       { color: "#14532D", label: "أخضر غامق" },
                       { color: "#7C2D12", label: "بني غامق" },
                       { color: "#581C87", label: "بنفسجي غامق" },
                       { color: "#1E3A5F", label: "أزرق داكن" },
                       { color: "#831843", label: "عنابي" },
                       { color: "#164E63", label: "سماوي داكن" },
                       { color: "#3F1515", label: "أحمر داكن" },
                       { color: "#374151", label: "رمادي" },
                     ].map((p) => (
                       <button
                         key={p.color}
                         title={p.label}
                         onClick={() => setSettings({...settings, shadowColor: p.color})}
                         className={cn(
                           "w-full aspect-square rounded-xl border-2 transition-all hover:scale-110",
                           (settings.shadowColor ?? "#000000") === p.color
                             ? "border-white scale-110 shadow-lg"
                             : "border-transparent"
                         )}
                         style={{ backgroundColor: p.color }}
                       />
                     ))}
                   </div>
                   <ColorPicker label="لون مخصص" value={settings.shadowColor ?? "#000000"} onChange={(v: string) => setSettings({...settings, shadowColor: v})} />
                 </>
               )}
               {(settings.shadowColorMode ?? "fixed") === "random" && (
                 <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
                   <span className="text-lg">🎲</span>
                   <p className="text-xs text-foreground/70 leading-relaxed">
                     لون <span className="text-amber-400 font-black">ظل النص</span> سيتغير عشوائياً في كل فيديو لتنوع بصري تلقائي
                   </p>
                 </div>
               )}
             </div>
           </div>
        )}
        
        {tab === 'audio' && (
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             <Select label="أسلوب الدعاء" value={settings.duaaStyle || "عشوائي"} onChange={(v: string) => setSettings({...settings, duaaStyle: v})} options={[
               {label: "عشوائي 🎲 — يتغير في كل دعاء", value: "عشوائي"},
               {label: "تضرع وخشوع", value: "تضرع وخشوع"},
               {label: "شكر وحمد", value: "شكر وحمد"},
               {label: "استغفار", value: "استغفار"},
               {label: "رجاء وأمل", value: "رجاء وأمل"},
               {label: "توكل وثقة", value: "توكل وثقة"},
               {label: "دعاء الصباح", value: "دعاء الصباح"},
               {label: "دعاء المساء", value: "دعاء المساء"},
             ]} />

             <div className="space-y-2">
               <button
                 onClick={() => setVoicesOpen(!voicesOpen)}
                 className="flex items-center justify-between w-full py-2 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 transition-all text-xs font-bold text-foreground/80"
               >
                 <span className="flex items-center gap-2">
                   <Mic2 className="w-3.5 h-3.5 text-emerald-400" />
                   <span>اختيار الصوت المُستخدم</span>
                 </span>
                 <span className={cn("transition-transform duration-200 text-emerald-400", voicesOpen ? "rotate-180" : "")}>▼</span>
               </button>
               {voicesOpen && (
               <div className="space-y-1.5 pl-2 border-r border-emerald-500/20 pr-3 animate-in fade-in slide-in-from-top-2 duration-200">
                 {/* Random voice option */}
                 <button
                   onClick={() => setSettings({...settings, ttsVoice: "random"})}
                   className={cn(
                     "flex items-center gap-3 w-full text-right px-3 py-2.5 rounded-xl border transition-all text-sm",
                     (settings.ttsVoice === "random" || !settings.ttsVoice)
                       ? "border-primary bg-primary/15 text-foreground shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                       : "border-border/50 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground"
                   )}
                 >
                   <span className="text-lg">🎲</span>
                   <span className="flex flex-col items-start">
                     <span className="font-black text-sm">عشوائي</span>
                     <span className="text-[11px] opacity-70">يختار صوتاً مختلفاً في كل دعاء</span>
                   </span>
                   {(settings.ttsVoice === "random" || !settings.ttsVoice) && (
                     <span className="mr-auto text-primary text-xs font-black">✓</span>
                   )}
                 </button>

                 <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest pt-1">أصوات ذكور — عميقة للخشوع</p>
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
               )}
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

             <div className="pt-3 border-t border-border/50 space-y-4">
               <button
                 onClick={() => setVolumeOpen(!volumeOpen)}
                 className="flex items-center justify-between w-full py-2 px-3 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-all text-xs font-bold text-foreground/80"
               >
                 <span className="flex items-center gap-2">
                   <Volume2 className="w-3.5 h-3.5 text-primary" />
                   <span>التحكم في مستوى الصوت</span>
                 </span>
                 <span className={cn("transition-transform duration-200 text-primary", volumeOpen ? "rotate-180" : "")}>▼</span>
               </button>
               {volumeOpen && (
               <div className="space-y-4">
               {/* Duaa volume + mute */}
               <div className="space-y-1.5">
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-foreground/60">🤲 صوت الدعاء</span>
                   <button
                     onClick={() => setSettings({...settings, muteDuaa: !(settings.muteDuaa ?? false)})}
                     className={cn(
                       "flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border",
                       (settings.muteDuaa ?? false)
                         ? "bg-red-500/20 border-red-500/40 text-red-400"
                         : "bg-black/30 border-border/40 text-muted-foreground hover:text-foreground"
                     )}
                   >
                     {(settings.muteDuaa ?? false) ? <><VolumeX className="w-3 h-3" /> مكتوم</> : <><Volume2 className="w-3 h-3" /> كتم</>}
                   </button>
                 </div>
                 <Slider
                   label=""
                   min={0} max={300} step={5}
                   value={settings.duaaVolume ?? 120}
                   onChange={(v: number) => setSettings({...settings, duaaVolume: v})}
                   unit="%" disabled={settings.muteDuaa ?? false}
                 />
               </div>

               {/* Original video volume + mute */}
               <div className="space-y-1.5">
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-foreground/60">🎥 صوت الفيديو الأصلي</span>
                   <button
                     onClick={() => setSettings({...settings, muteOriginal: !(settings.muteOriginal ?? false)})}
                     className={cn(
                       "flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border",
                       (settings.muteOriginal ?? false)
                         ? "bg-red-500/20 border-red-500/40 text-red-400"
                         : "bg-black/30 border-border/40 text-muted-foreground hover:text-foreground"
                     )}
                   >
                     {(settings.muteOriginal ?? false) ? <><VolumeX className="w-3 h-3" /> مكتوم</> : <><Volume2 className="w-3 h-3" /> كتم</>}
                   </button>
                 </div>
                 <Slider
                   label=""
                   min={0} max={200} step={5}
                   value={settings.originalVolume ?? 90}
                   onChange={(v: number) => setSettings({...settings, originalVolume: v})}
                   unit="%" disabled={settings.muteOriginal ?? false}
                 />
               </div>

               <div className="text-[11px] text-muted-foreground/60 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
                 الدعاء: <span className="text-primary font-bold">{(settings.muteDuaa ?? false) ? "مكتوم" : `${settings.duaaVolume ?? 120}%`}</span>
                 &nbsp;·&nbsp; الأصلي: <span className="text-foreground/70 font-bold">{(settings.muteOriginal ?? false) ? "مكتوم" : `${settings.originalVolume ?? 90}%`}</span>
               </div>
               </div>
               )}
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

      {isSaving && (
        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-primary/70 font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          جاري الحفظ التلقائي...
        </div>
      )}
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

  const shadowColor = settings.shadowColor ?? "#000000";
  const shadowMode = settings.shadowColorMode ?? "fixed";
  const bgMode = settings.bgColorMode ?? "fixed";
  const ps1 = Math.max(1, Math.round(9 * scale));
  const ps2 = Math.max(2, Math.round(18 * scale));
  const ps3 = Math.max(3, Math.round(36 * scale));
  const previewTextShadow = shadowMode === "none"
    ? "none"
    : `${ps1}px ${ps1}px ${ps1 * 3}px ${shadowColor}, ${ps2}px ${ps2}px ${ps2 * 3}px ${shadowColor}cc, ${ps3}px ${ps3}px ${ps3 * 3}px ${shadowColor}88`;

  const bgOpacityVal = (settings.bgOpacity ?? 40) / 100;
  const wordBgColor = bgMode === "none"
    ? "transparent"
    : bgMode === "random"
      ? `rgba(59,130,246,${bgOpacityVal})`
      : `${settings.bgColor ?? "#3B82F6"}${Math.round((settings.bgOpacity ?? 40) * 2.55).toString(16).padStart(2, "0")}`;
  const wordBoxShadow = bgMode === "none"
    ? "none"
    : `0 0 ${ps3 * 2}px ${settings.activeColor}99, 0 0 ${ps2 * 2}px ${settings.bgColor ?? "#3B82F6"}88`;

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
              className="absolute inset-x-0"
              style={{
                top: `calc(${yPercent}% - 36px)`,
                height: "72px",
                background: `rgba(0,0,0,${(settings.bgOpacity ?? 40) / 100})`,
                boxShadow: `0 0 ${Math.round(24 * scale)}px ${Math.round(24 * scale)}px rgba(0,0,0,${(settings.bgOpacity ?? 40) / 100})`,
                filter: `blur(${Math.max(2, Math.round(8 * scale))}px)`,
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
                textShadow: previewTextShadow,
                textAlign: "center",
                padding: "0 8px",
                maxWidth: "100%",
              }}
            >
              <span>اللَّهُمَّ </span>
              <span
                style={{
                  color: settings.activeColor,
                  backgroundColor: wordBgColor,
                  padding: bgMode === "none" ? "0" : "0 4px",
                  borderRadius: "6px",
                  boxShadow: wordBoxShadow,
                  borderBottom: bgMode === "none" ? "none" : `1px solid ${settings.activeColor}80`,
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
          <span className="font-bold">سُمك الحدود:</span>
          <span className="text-foreground/80 font-semibold">{settings.strokeThickness ?? 2}px</span>
          <span className="font-bold">نسبة الأبعاد:</span>
          <span className="text-foreground/80 font-semibold">{settings.aspectRatio ?? "9:16"}</span>
          <span className="font-bold">تأثير الكلمة:</span>
          <span className="text-foreground/80 font-semibold">{settings.wordEffect ?? "zoom"}</span>
          <span className="font-bold">الانتقال:</span>
          <span className="text-foreground/80 font-semibold">{settings.transitionEffect ?? "fade"} / {settings.transitionDuration ?? 0.5}ث</span>
          <span className="font-bold">خلفية الكلمة:</span>
          <span className="text-foreground/80 font-semibold">
            {(settings.showBackground ?? true)
              ? `${settings.bgOpacity ?? 40}% — ${(settings.bgColorMode ?? "fixed") === "random" ? "عشوائي" : (settings.bgColor ?? "#3B82F6")}`
              : "مخفية"}
          </span>
          <span className="font-bold">لون النص:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ background: settings.textColor }} />
            <span className="text-foreground/80 font-mono">{settings.textColor}</span>
          </span>
          <span className="font-bold">لون النشط:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ background: settings.activeColor }} />
            <span className="text-foreground/80 font-mono">{settings.activeColor}</span>
          </span>
          <span className="font-bold">لون الظل:</span>
          <span className="flex items-center gap-1.5">
            {(settings.shadowColorMode ?? "fixed") === "none"
              ? <span className="text-destructive font-bold">توقف ⛔</span>
              : (settings.shadowColorMode ?? "fixed") === "random"
                ? <span className="text-amber-400 font-bold">عشوائي 🎲</span>
                : <>
                    <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ background: settings.shadowColor ?? "#000000" }} />
                    <span className="text-foreground/80 font-mono">{settings.shadowColor ?? "#000000"}</span>
                  </>
            }
          </span>
          <span className="font-bold">لون الخلفية:</span>
          <span className="flex items-center gap-1.5">
            {(settings.bgColorMode ?? "fixed") === "none"
              ? <span className="text-destructive font-bold">توقف ⛔</span>
              : (settings.bgColorMode ?? "fixed") === "random"
                ? <span className="text-amber-400 font-bold">عشوائي 🎲</span>
                : <>
                    <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ background: settings.bgColor ?? "#3B82F6" }} />
                    <span className="text-foreground/80 font-mono">{settings.bgColor ?? "#3B82F6"}</span>
                  </>
            }
          </span>
        </div>

        <p className="text-center text-xs font-bold text-muted-foreground/60">
          الكلمة الملونة تُضاء بالتزامن مع الصوت أثناء التشغيل الفعلي
        </p>
      </div>
    </PremiumCard>
  );
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  success:    "text-green-400 font-bold",
  error:      "text-red-400 font-bold",
  warning:    "text-yellow-400 font-semibold",
  info:       "text-blue-300 font-semibold",
  processing: "text-violet-400 font-bold animate-pulse",
};

const LOG_LEVEL_PREFIX: Record<string, string> = {
  success:    "✅",
  error:      "❌",
  warning:    "⚠️",
  info:       "ℹ️",
  processing: "⏳",
};

const MAX_DISPLAYED_LOGS = 80;

function LogsCard({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const displayedLogs = logs.slice(-MAX_DISPLAYED_LOGS);

  return (
    <PremiumCard title="سجل العمليات المباشر" icon={Activity}>
      <div
        ref={containerRef}
        className="overflow-y-auto bg-[#030712] border border-border/60 rounded-2xl font-mono text-xs shadow-[inset_0_4px_20px_rgba(0,0,0,0.7)]"
        style={{ height: "420px", maxHeight: "420px" }}
      >
        {displayedLogs.length === 0 ? (
          <div className="text-muted-foreground/30 text-center h-full flex flex-col items-center justify-center gap-3 p-6">
            <Activity className="w-8 h-8 opacity-20" />
            <span className="font-bold tracking-wide text-sm">في انتظار بدء البوت واستقبال المقاطع...</span>
          </div>
        ) : (
          <div className="p-3 space-y-0.5">
            {displayedLogs.map((log, idx) => (
              <div
                key={log.id ?? idx}
                className="flex gap-2 items-start px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
              >
                <span className="text-muted-foreground/30 shrink-0 font-bold tabular-nums text-[10px] pt-0.5 w-14">{log.time}</span>
                <span className="text-[10px] shrink-0 pt-0.5">{LOG_LEVEL_PREFIX[log.level] ?? "•"}</span>
                <span className={cn(
                  "leading-relaxed flex-1 min-w-0 break-words",
                  LOG_LEVEL_COLORS[log.level] ?? "text-foreground/70"
                )}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {logs.length > MAX_DISPLAYED_LOGS && (
        <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
          يعرض آخر {MAX_DISPLAYED_LOGS} سجل من أصل {logs.length}
        </p>
      )}
    </PremiumCard>
  );
}

export function Dashboard() {
  const { data: status } = useGetBotStatus({ query: { refetchInterval: 3000 } });
  const { data: serverSettings } = useGetSettings();
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateSettings();
  const { toast } = useToast();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSendingWelcome, setIsSendingWelcome] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (serverSettings && !settings) {
      setSettings(serverSettings);
    }
  }, [serverSettings]);

  const handleSettingChange = (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateSettings({ data: newSettings });
    }, 1200);
  };

  const handleSendWelcome = async () => {
    setIsSendingWelcome(true);
    try {
      const res = await fetch("/api/bot/send-welcome", { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      if (data.success) toast({ title: "تم الإرسال", description: data.message });
      else toast({ title: "تنبيه", description: data.message, variant: "destructive" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر إرسال الرسالة", variant: "destructive" });
    } finally {
      setIsSendingWelcome(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      <div className="lg:col-span-5 space-y-8 lg:space-y-10">
        <BotStatusMiniCard
          status={status}
          onSendWelcome={handleSendWelcome}
          isSendingWelcome={isSendingWelcome}
        />
        <DesignSettingsCard 
          settings={settings} 
          setSettings={handleSettingChange} 
          onSave={() => {}} 
          isSaving={isUpdating} 
        />
        <SocialMediaCard
          settings={settings}
          setSettings={handleSettingChange}
          onSave={() => {}}
          isSaving={isUpdating}
        />
      </div>
      
      <div className="lg:col-span-7 flex flex-col gap-8 lg:gap-10 h-full">
        <PreviewCard settings={settings} />
        <LogsCard logs={status?.logs || []} />
      </div>
    </div>
  )
}
