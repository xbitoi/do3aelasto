import { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings, useStartBot, useStopBot, useTestBot, useGetBotStatus } from "@workspace/api-client-react";
import type { AppSettings, BotStatus, LogEntry } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Input, Slider, ColorPicker, Select, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Activity, Key, Paintbrush, Save, LayoutTemplate, Palette, Mic2, Server, ChevronDown } from "lucide-react";
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

function DesignSettingsCard({ settings, setSettings, onSave, isSaving }: any) {
  const [tab, setTab] = useState<'text' | 'color' | 'audio'>('text');
  
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
             <div className="pt-3 border-t border-border/50">
               <Switch label="تخفيض سرعة القراءة (لزيادة الوضوح)" checked={settings.ttsSpeed} onChange={(v: boolean) => setSettings({...settings, ttsSpeed: v})} />
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

  // Facebook Reels: 1080×1920 (9:16). We render a scaled-down version.
  // Preview container: 216px wide → height = 216 * (16/9) = 384px
  const PREVIEW_W = 216;
  const PREVIEW_H = Math.round(PREVIEW_W * (16 / 9));
  // Scale factor relative to a reference 1080px-wide video
  const scale = PREVIEW_W / 1080;

  const previewFontSize = Math.max(8, Math.round(settings.fontSize * scale));
  const previewStroke = Math.max(0, Math.round(settings.strokeThickness * scale));
  const yPercent = settings.yPosition; // keep as-is, it's a percentage

  const fontFamily = FONT_FAMILY_MAP[settings.font] ?? "'Cairo', sans-serif";

  return (
    <PremiumCard title="معاينة — ريلز فيسبوك (9:16)" icon={LayoutTemplate}>
      <div className="flex flex-col items-center gap-5">
        {/* Reels frame */}
        <div
          className="relative overflow-hidden rounded-2xl border-2 border-border/60 shadow-[0_0_40px_rgba(0,0,0,0.8)] flex-shrink-0"
          style={{ width: PREVIEW_W, height: PREVIEW_H, background: "#0a0a0a" }}
        >
          {/* Grid overlay to simulate video background */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:12px_12px]" />

          {/* Gradient to simulate video content */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-green-950/30" />

          {/* Fake phone UI bar (status) */}
          <div className="absolute top-0 inset-x-0 h-5 bg-black/50 flex items-center justify-center">
            <div className="w-12 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Background band behind text (if enabled) */}
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

          {/* Text overlay — positioned at yPosition% from top */}
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

          {/* Fake Reels label */}
          <div className="absolute bottom-5 inset-x-0 flex flex-col items-start px-3 gap-1">
            <div className="w-16 h-1.5 bg-white/25 rounded-full" />
            <div className="w-10 h-1.5 bg-white/15 rounded-full" />
          </div>

          {/* Reels badge */}
          <div className="absolute top-6 left-2 text-[7px] font-black text-white/60 bg-black/40 px-1.5 py-0.5 rounded-md tracking-widest">
            REELS
          </div>
        </div>

        {/* Settings summary */}
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
      </div>
      
      <div className="lg:col-span-7 flex flex-col gap-8 lg:gap-10 h-full">
        <PreviewCard settings={settings} />
        <StatusCard status={status} />
        <LogsCard logs={status?.logs || []} />
      </div>
    </div>
  )
}
