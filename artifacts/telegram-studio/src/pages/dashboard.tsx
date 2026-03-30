import { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings, useStartBot, useStopBot, useTestBot, useGetBotStatus } from "@workspace/api-client-react";
import type { AppSettings, BotStatus, LogEntry } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Input, Slider, ColorPicker, Select, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Activity, Key, Paintbrush, Save, LayoutTemplate, Palette, Mic2, Server } from "lucide-react";
import { cn } from "@/lib/utils";

function ApiKeysCard({ isRunning, onStart, onStop, onTest, isTesting, isStarting, isStopping }: any) {
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('geminiKey') || '');
  const [groqKey, setGroqKey] = useState(localStorage.getItem('groqKey') || '');
  const [botToken, setBotToken] = useState(localStorage.getItem('botToken') || '');

  useEffect(() => {
    localStorage.setItem('geminiKey', geminiKey);
    localStorage.setItem('groqKey', groqKey);
    localStorage.setItem('botToken', botToken);
  }, [geminiKey, groqKey, botToken]);

  return (
    <PremiumCard title="مفاتيح API والتحكم" icon={Key}>
      <div className="space-y-6 mb-8">
        <div className="space-y-3">
          <label className="text-sm font-bold text-foreground/90 ml-1 block">مفتاح Gemini AI</label>
          <Input type="password" placeholder="AIzaSy..." value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
        </div>
        <div className="space-y-3">
          <label className="text-sm font-bold text-foreground/90 ml-1 block">
            مفتاح Groq AI
            <span className="text-xs text-muted-foreground font-normal mr-2">(احتياطي عند فشل Gemini)</span>
          </label>
          <Input type="password" placeholder="gsk_..." value={groqKey} onChange={(e) => setGroqKey(e.target.value)} />
        </div>
        <div className="space-y-3">
          <label className="text-sm font-bold text-foreground/90 ml-1 block">توكن بوت تيليغرام</label>
          <Input type="password" placeholder="123456789:AA..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <PremiumButton 
          onClick={() => onStart(geminiKey, botToken, groqKey)} 
          disabled={isRunning}
          isLoading={isStarting}
        >
          <Play className="w-5 h-5" />
          تشغيل البوت
        </PremiumButton>
        
        <PremiumButton 
          variant="destructive" 
          onClick={onStop} 
          disabled={!isRunning}
          isLoading={isStopping}
        >
          <Square className="w-5 h-5 fill-current" />
          إيقاف البوت
        </PremiumButton>
      </div>

      <PremiumButton 
        variant="secondary" 
        onClick={() => onTest(botToken)}
        isLoading={isTesting}
        className="w-full"
      >
        <Server className="w-5 h-5" />
        اختبار الاتصال
      </PremiumButton>
    </PremiumCard>
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

      <div className="space-y-8 min-h-[380px]">
        {tab === 'text' && (
           <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <Select label="نوع الخط" value={settings.font} onChange={(v: string) => setSettings({...settings, font: v})} options={[
               {label: "BeIn - خط القاهرة الحديث", value: "BeIn"},
               {label: "Boutros - خط كلاسيكي", value: "Boutros"},
               {label: "Dima - خط قرآني", value: "Dima"},
               {label: "Takeaway - خط عصري", value: "Takeaway"}
             ]} />
             <Slider label="حجم الخط" min={20} max={150} step={1} value={settings.fontSize} onChange={(v: number) => setSettings({...settings, fontSize: v})} unit="px" />
             <Slider label="الموضع العمودي" min={10} max={95} step={1} value={settings.yPosition} onChange={(v: number) => setSettings({...settings, yPosition: v})} unit="%" />
             <Slider label="ارتفاع السطر" min={1.0} max={3.0} step={0.1} value={settings.lineHeight} onChange={(v: number) => setSettings({...settings, lineHeight: v})} unit="x" />
             <Slider label="سُمك الحدود" min={0} max={10} step={1} value={settings.strokeThickness} onChange={(v: number) => setSettings({...settings, strokeThickness: v})} unit="px" />
           </div>
        )}
        
        {tab === 'color' && (
           <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <ColorPicker label="لون النص الأساسي" value={settings.textColor} onChange={(v: string) => setSettings({...settings, textColor: v})} />
             <ColorPicker label="لون الكلمة النشطة" value={settings.activeColor} onChange={(v: string) => setSettings({...settings, activeColor: v})} />
           </div>
        )}
        
        {tab === 'audio' && (
           <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <Select label="أسلوب الدعاء" value={settings.duaaStyle} onChange={(v: string) => setSettings({...settings, duaaStyle: v})} options={[
               {label: "تضرع وخشوع", value: "تضرع وخشوع"},
               {label: "شكر وحمد", value: "شكر وحمد"},
               {label: "استغفار", value: "استغفار"},
               {label: "رجاء وأمل", value: "رجاء وأمل"},
               {label: "توكل وثقة", value: "توكل وثقة"}
             ]} />
             <div className="pt-4 border-t border-border/50">
               <Switch label="تخفيض سرعة القراءة (لزيادة الوضوح)" checked={settings.ttsSpeed} onChange={(v: boolean) => setSettings({...settings, ttsSpeed: v})} />
             </div>
           </div>
        )}
      </div>

      <PremiumButton onClick={onSave} isLoading={isSaving} className="w-full mt-10">
        <Save className="w-5 h-5" />
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

function PreviewCard({ settings }: { settings: AppSettings | null }) {
  if (!settings) return null;
  const sampleText = "اللَّهُمَّ إِنَّا نَسْأَلُكَ رَحْمَتَكَ";
  
  return (
    <PremiumCard title="المعاينة المباشرة" icon={LayoutTemplate}>
      <div className="bg-[#050505] border-2 border-border/50 rounded-2xl flex items-center justify-center min-h-[260px] p-8 text-center relative overflow-hidden shadow-[inset_0_4px_40px_rgba(0,0,0,0.8)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {settings.showBackground && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-40 bg-black blur-2xl" style={{ opacity: (settings.bgOpacity || 40) / 100 }} />
        )}

        <div 
          style={{ 
            fontFamily: "'Cairo', sans-serif",
            fontSize: `${Math.min(settings.fontSize, 48)}px`,
            lineHeight: settings.lineHeight,
            color: settings.textColor,
            WebkitTextStroke: `${settings.strokeThickness}px rgba(0,0,0,0.9)`,
            textShadow: '0px 8px 24px rgba(0,0,0,0.9)'
          }}
          className="relative z-10 font-black tracking-wider transition-all duration-300"
        >
          <span>اللَّهُمَّ </span>
          <span style={{ 
            color: settings.activeColor,
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: '0 8px',
            borderRadius: '12px',
            boxShadow: `0 0 30px ${settings.activeColor}50`,
            borderBottom: `2px solid ${settings.activeColor}80`
          }} className="transition-colors duration-300">إِنَّا</span>
          <span> نَسْأَلُكَ رَحْمَتَكَ</span>
        </div>
      </div>
      <p className="text-center text-sm font-bold text-muted-foreground mt-5">
        الكلمة الملونة تمثل الكلمة النشطة حالياً بالتزامن مع قراءة الصوت
      </p>
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
        <StatusCard status={status} />
        <PreviewCard settings={settings} />
        <LogsCard logs={status?.logs || []} />
      </div>
    </div>
  )
}
