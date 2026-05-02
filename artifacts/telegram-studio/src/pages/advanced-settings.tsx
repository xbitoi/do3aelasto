import { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import type { AppSettings } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Slider, Select, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { Video, SlidersHorizontal, Key, ChevronDown, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

function KeyInput({ label, placeholder, value, onChange, hint }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground/70 block">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 pl-10 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-mono shadow-inner placeholder:text-muted-foreground/40"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground/50 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SocialTokenSection({ label, icon: Icon, value, onChange, onTest, testing, testResult, hint }: any) {
  return (
    <div className="space-y-2 p-4 bg-black/20 rounded-2xl border border-border/40">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-bold text-foreground">{label}</span>
        {testResult?.success === true && (
          <span className="mr-auto flex items-center gap-1 text-[11px] text-green-400 font-bold">
            <CheckCircle2 className="w-3 h-3" /> {testResult.info}
          </span>
        )}
        {testResult?.success === false && (
          <span className="mr-auto flex items-center gap-1 text-[11px] text-red-400 font-bold max-w-[200px] truncate">
            <XCircle className="w-3 h-3 shrink-0" /> {testResult.error || "فشل الاتصال"}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="password"
            placeholder="أدخل التوكن..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            dir="ltr"
            className="w-full bg-black/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-all text-foreground text-xs font-mono shadow-inner placeholder:text-muted-foreground/40"
          />
        </div>
        <button
          onClick={onTest}
          disabled={!value || testing}
          className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-2 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : "اختبار"}
        </button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground/40 leading-relaxed">{hint}</p>}
    </div>
  );
}

function YouTubeTokenSection({ refreshToken, clientId, clientSecret, onChangeRefresh, onChangeClientId, onChangeClientSecret, onTest, testing, testResult }: {
  refreshToken: string; clientId: string; clientSecret: string;
  onChangeRefresh: (v: string) => void; onChangeClientId: (v: string) => void; onChangeClientSecret: (v: string) => void;
  onTest: () => void; testing: boolean; testResult?: { loading: boolean; success?: boolean; info?: string };
}) {
  return (
    <div className="space-y-3 p-4 bg-black/20 rounded-2xl border border-border/40">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        <span className="text-sm font-bold text-foreground">يوتيوب (OAuth2)</span>
        {testResult?.success === true && (
          <span className="mr-auto flex items-center gap-1 text-[11px] text-green-400 font-bold">
            <CheckCircle2 className="w-3 h-3" /> {testResult.info}
          </span>
        )}
        {testResult?.success === false && (
          <span className="mr-auto flex items-center gap-1 text-[11px] text-red-400 font-bold">
            <XCircle className="w-3 h-3" /> فشل الاتصال
          </span>
        )}
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider block mb-1">Refresh Token</label>
          <input type="password" placeholder="1//04Q1dan-..." value={refreshToken} onChange={(e) => onChangeRefresh(e.target.value)} dir="ltr"
            className="w-full bg-black/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-all text-foreground text-xs font-mono shadow-inner placeholder:text-muted-foreground/40" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider block mb-1">Client ID</label>
          <input type="password" placeholder="xxxxx.apps.googleusercontent.com" value={clientId} onChange={(e) => onChangeClientId(e.target.value)} dir="ltr"
            className="w-full bg-black/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-all text-foreground text-xs font-mono shadow-inner placeholder:text-muted-foreground/40" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider block mb-1">Client Secret</label>
          <input type="password" placeholder="GOCSPX-..." value={clientSecret} onChange={(e) => onChangeClientSecret(e.target.value)} dir="ltr"
            className="w-full bg-black/40 border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-all text-foreground text-xs font-mono shadow-inner placeholder:text-muted-foreground/40" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button onClick={onTest} disabled={!refreshToken || !clientId || !clientSecret || testing}
          className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap">
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : "اختبار الاتصال"}
        </button>
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed text-left">من Google Cloud Console</p>
      </div>
    </div>
  );
}

export function AdvancedSettings() {
  const { data: serverSettings, isLoading } = useGetSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { toast } = useToast();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [keysOpen, setKeysOpen] = useState(true);
  const [botToken, setBotToken] = useState(localStorage.getItem("botToken") || "");
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem("geminiKey") || "");
  const [groqKey, setGroqKey] = useState(localStorage.getItem("groqKey") || "");
  const [botStatus, setBotStatus] = useState<{ applying: boolean; result?: { success: boolean; message: string } }>({ applying: false });
  const [telegramStatus, setTelegramStatus] = useState<{ loading: boolean; valid?: boolean; botName?: string; botUsername?: string; error?: string } | null>(null);
  const [socialTests, setSocialTests] = useState<Record<string, { loading: boolean; success?: boolean; info?: string }>>({});
  const [geminiStatus, setGeminiStatus] = useState<{ loading: boolean; valid?: boolean; status?: string; message?: string; models?: string[] } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botRestartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telegramCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (serverSettings) setSettings(serverSettings);
  }, [serverSettings]);

  useEffect(() => {
    fetch("/api/credentials").then(r => r.json()).then((creds: { botToken: string; geminiKey: string; groqKey: string }) => {
      if (creds.botToken && !localStorage.getItem("botToken")) { setBotToken(creds.botToken); localStorage.setItem("botToken", creds.botToken); }
      else if (creds.botToken && !botToken) { setBotToken(creds.botToken); }
      if (creds.geminiKey && !localStorage.getItem("geminiKey")) { setGeminiKey(creds.geminiKey); localStorage.setItem("geminiKey", creds.geminiKey); }
      else if (creds.geminiKey && !geminiKey) { setGeminiKey(creds.geminiKey); }
      if (creds.groqKey && !localStorage.getItem("groqKey")) { setGroqKey(creds.groqKey); localStorage.setItem("groqKey", creds.groqKey); }
      else if (creds.groqKey && !groqKey) { setGroqKey(creds.groqKey); }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSettingChange = (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateSettings({ data: newSettings });
    }, 1200);
  };

  const checkGeminiStatus = async (key: string) => {
    if (!key) return;
    setGeminiStatus({ loading: true });
    try {
      const res = await fetch(`/api/gemini-status?geminiKey=${encodeURIComponent(key)}`);
      const data = await res.json() as { valid: boolean; status: string; message: string; models?: string[] };
      setGeminiStatus({ loading: false, valid: data.valid, status: data.status, message: data.message, models: data.models });
    } catch {
      setGeminiStatus({ loading: false, valid: false, status: "error", message: "تعذّر الاتصال بالخادم" });
    }
  };

  const checkTelegramStatus = async (token: string) => {
    if (!token) { setTelegramStatus(null); return; }
    setTelegramStatus({ loading: true });
    try {
      const res = await fetch("/api/bot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });
      const data = await res.json() as { success: boolean; botName?: string; botUsername?: string; error?: string };
      setTelegramStatus({ loading: false, valid: data.success, botName: data.botName, botUsername: data.botUsername, error: data.error });
    } catch {
      setTelegramStatus({ loading: false, valid: false, error: "تعذّر الاتصال بالخادم" });
    }
  };

  const saveKeys = (token: string, gemini: string, groq: string) => {
    if (!token && !gemini) return;
    fetch("/api/credentials/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token, geminiKey: gemini, groqKey: groq }),
    }).catch(() => {});
  };

  const handleBotKeyChange = (field: "botToken" | "geminiKey" | "groqKey", value: string) => {
    const newToken = field === "botToken" ? value : botToken;
    const newGemini = field === "geminiKey" ? value : geminiKey;
    const newGroq = field === "groqKey" ? value : groqKey;

    if (field === "botToken") { setBotToken(value); localStorage.setItem("botToken", value); setTelegramStatus(null); }
    if (field === "geminiKey") { setGeminiKey(value); localStorage.setItem("geminiKey", value); setGeminiStatus(null); }
    if (field === "groqKey") { setGroqKey(value); localStorage.setItem("groqKey", value); }

    if (telegramCheckTimer.current) clearTimeout(telegramCheckTimer.current);
    if (field === "botToken") {
      telegramCheckTimer.current = setTimeout(() => checkTelegramStatus(value), 1200);
    }

    if (botRestartTimer.current) clearTimeout(botRestartTimer.current);
    botRestartTimer.current = setTimeout(() => {
      saveKeys(newToken, newGemini, newGroq);
      applyBotKeys(newToken, newGemini, newGroq);
    }, 2000);
  };

  const applyBotKeys = async (token: string, gemini: string, groq: string) => {
    if (!token || !gemini) return;
    setBotStatus({ applying: true });
    try {
      const res = await fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token, geminiKey: gemini, groqKey: groq }),
      });
      const data = await res.json() as { success: boolean; message: string };
      setBotStatus({ applying: false, result: data });
      if (data.success) toast({ title: "تم تطبيق المفاتيح", description: data.message });
    } catch {
      setBotStatus({ applying: false, result: { success: false, message: "تعذّر الاتصال بالخادم" } });
    }
  };

  const handleSocialTokenChange = (field: keyof AppSettings, value: string) => {
    if (!settings) return;
    const newSettings = { ...settings, [field]: value };
    handleSettingChange(newSettings);
  };

  const testSocial = async (platform: "youtube" | "facebook" | "tiktok") => {
    if (platform === "youtube") {
      if (!settings?.youtubeToken || !settings?.youtubeClientId || !settings?.youtubeClientSecret) return;
      setSocialTests(p => ({ ...p, youtube: { loading: true } }));
      try {
        const res = await fetch("/api/social/test-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: settings.youtubeToken, clientId: settings.youtubeClientId, clientSecret: settings.youtubeClientSecret }),
        });
        const data = await res.json() as { success: boolean; channelName?: string; subscribers?: string; error?: string };
        if (data.success) {
          const info = (data.channelName || "") + (data.subscribers ? ` (${data.subscribers})` : "");
          setSocialTests(p => ({ ...p, youtube: { loading: false, success: true, info } }));
        } else {
          setSocialTests(p => ({ ...p, youtube: { loading: false, success: false } }));
        }
      } catch {
        setSocialTests(p => ({ ...p, youtube: { loading: false, success: false } }));
      }
      return;
    }
    const token = platform === "facebook" ? settings?.facebookToken : settings?.tiktokToken;
    if (!token) return;
    setSocialTests(p => ({ ...p, [platform]: { loading: true } }));
    try {
      const res = await fetch(`/api/social/test-${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { success: boolean; channelName?: string; pageName?: string; displayName?: string; subscribers?: number; followers?: number; error?: string };
      if (data.success) {
        const name = data.channelName || data.pageName || data.displayName || "";
        const count = data.subscribers || data.followers;
        const info = name + (count ? ` (${count.toLocaleString()})` : "");
        setSocialTests(p => ({ ...p, [platform]: { loading: false, success: true, info } }));
      } else {
        setSocialTests(p => ({ ...p, [platform]: { loading: false, success: false } }));
      }
    } catch {
      setSocialTests(p => ({ ...p, [platform]: { loading: false, success: false } }));
    }
  };

  if (!settings || isLoading) {
    return <div className="animate-pulse h-[600px] bg-card rounded-[2rem]" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-4xl">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black mb-2 sm:mb-3 tracking-tight text-foreground">الإعدادات المتقدمة</h2>
          <p className="text-lg font-semibold text-muted-foreground">المفاتيح وخيارات المعالجة المتقدمة</p>
        </div>
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-primary/70 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            حفظ تلقائي...
          </div>
        )}
      </div>

      {/* ── Keys Section ── */}
      <div className="relative group rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        <button
          onClick={() => setKeysOpen(!keysOpen)}
          className="relative z-10 w-full flex items-center justify-between gap-4 p-6 sm:p-8 text-right hover:bg-white/3 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20 shadow-inner">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div className="text-right">
              <h3 className="text-xl font-black text-foreground tracking-tight">مفاتيح API والتوكنات</h3>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">بوت تيليغرام · Gemini · Groq · يوتيوب · فيسبوك · تيك توك</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {botStatus.applying && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
            {botStatus.result?.success === true && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {botStatus.result?.success === false && <XCircle className="w-4 h-4 text-red-400" />}
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", keysOpen && "rotate-180")} />
          </div>
        </button>

        <div className={cn("overflow-hidden transition-all duration-300", keysOpen ? "max-h-[1400px]" : "max-h-0")}>
          <div className="relative z-10 px-6 sm:px-8 pb-6 sm:pb-8 space-y-6">

            {/* Bot credentials */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest border-b border-border/30 pb-2">مفاتيح البوت الأساسية</p>
              <KeyInput
                label="توكن بوت تيليغرام"
                placeholder="123456789:AAHf..."
                value={botToken}
                onChange={(v) => handleBotKeyChange("botToken", v)}
                hint="من @BotFather في تيليغرام"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => checkTelegramStatus(botToken)}
                  disabled={!botToken || telegramStatus?.loading}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {telegramStatus?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  فحص التوكن
                </button>
                {telegramStatus && !telegramStatus.loading && (
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-lg border",
                    telegramStatus.valid
                      ? "text-green-400 bg-green-500/10 border-green-500/20"
                      : "text-red-400 bg-red-500/10 border-red-500/20"
                  )}>
                    {telegramStatus.valid
                      ? `✅ متصل — ${telegramStatus.botName} (@${telegramStatus.botUsername})`
                      : `❌ ${telegramStatus.error || "توكن غير صالح"}`}
                  </span>
                )}
              </div>
              <KeyInput
                label="مفتاح Gemini AI"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(v) => handleBotKeyChange("geminiKey", v)}
                hint="من Google AI Studio — مجاني لأكثر من مليون رمز يومياً"
              />
              {/* Gemini Key Status */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => checkGeminiStatus(geminiKey)}
                  disabled={!geminiKey || geminiStatus?.loading}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {geminiStatus?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  فحص حالة المفتاح
                </button>
                {geminiStatus && !geminiStatus.loading && (
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-lg border",
                    geminiStatus.valid
                      ? "text-green-400 bg-green-500/10 border-green-500/20"
                      : geminiStatus.status === "quota_exceeded"
                        ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                        : "text-red-400 bg-red-500/10 border-red-500/20"
                  )}>
                    {geminiStatus.message}
                  </span>
                )}
              </div>
              {geminiStatus?.valid && geminiStatus.models && geminiStatus.models.length > 0 && (
                <div className="text-[10px] text-muted-foreground/60 bg-black/20 rounded-xl px-3 py-2 border border-border/30 leading-relaxed">
                  📋 النماذج المتاحة: <span className="text-primary font-mono">{geminiStatus.models.slice(0, 3).join(" · ")}{geminiStatus.models.length > 3 ? ` · +${geminiStatus.models.length - 3}` : ""}</span>
                </div>
              )}
              <KeyInput
                label="مفتاح Groq AI (احتياطي)"
                placeholder="gsk_..."
                value={groqKey}
                onChange={(v) => handleBotKeyChange("groqKey", v)}
                hint="اختياري — يُستخدم عند فشل Gemini"
              />
              {botStatus.result && (
                <div className={cn("text-xs font-bold px-3 py-2 rounded-xl border", botStatus.result.success ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20")}>
                  {botStatus.result.success ? "✅" : "❌"} {botStatus.result.message}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/40 bg-black/20 rounded-xl px-3 py-2 border border-border/30">
                💾 يُحفظ تلقائياً بعد ثانيتين — ويُشغَّل البوت تلقائياً عند إدخال كلا المفتاحين
              </p>
            </div>

            {/* Social media tokens */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest border-b border-border/30 pb-2">منصات التواصل الاجتماعي</p>
              <YouTubeTokenSection
                refreshToken={settings.youtubeToken || ""}
                clientId={settings.youtubeClientId || ""}
                clientSecret={settings.youtubeClientSecret || ""}
                onChangeRefresh={(v: string) => handleSocialTokenChange("youtubeToken", v)}
                onChangeClientId={(v: string) => handleSocialTokenChange("youtubeClientId", v)}
                onChangeClientSecret={(v: string) => handleSocialTokenChange("youtubeClientSecret", v)}
                onTest={() => testSocial("youtube")}
                testing={socialTests.youtube?.loading ?? false}
                testResult={socialTests.youtube}
              />
              <SocialTokenSection
                label="فيسبوك"
                icon={({ className }: any) => <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                value={settings.facebookToken || ""}
                onChange={(v: string) => handleSocialTokenChange("facebookToken", v)}
                onTest={() => testSocial("facebook")}
                testing={socialTests.facebook?.loading}
                testResult={socialTests.facebook}
                hint="Page Access Token بصلاحية pages_manage_posts"
              />
              <SocialTokenSection
                label="تيك توك"
                icon={({ className }: any) => <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.72a4.85 4.85 0 0 1-1-.03z"/></svg>}
                value={settings.tiktokToken || ""}
                onChange={(v: string) => handleSocialTokenChange("tiktokToken", v)}
                onTest={() => testSocial("tiktok")}
                testing={socialTests.tiktok?.loading}
                testResult={socialTests.tiktok}
                hint="Content Posting API Token بصلاحية video.publish"
              />
            </div>

          </div>
        </div>
      </div>

      {/* ── Volume Control ── */}
      <PremiumCard title="التحكم بمستوى الصوت" icon={Volume2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Original video audio */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">🎥 صوت الفيديو الأصلي</span>
              <button
                onClick={() => handleSettingChange({...settings, muteOriginal: !(settings.muteOriginal ?? false)})}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                  (settings.muteOriginal ?? false)
                    ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
                    : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                )}
              >
                {(settings.muteOriginal ?? false)
                  ? <><VolumeX className="w-3.5 h-3.5" /> مكتوم</>
                  : <><Volume2 className="w-3.5 h-3.5" /> مفعّل</>
                }
              </button>
            </div>
            <Slider
              label=""
              min={0} max={200} step={5}
              value={settings.originalVolume ?? 90}
              onChange={(v: number) => handleSettingChange({...settings, originalVolume: v})}
              unit="%"
              disabled={settings.muteOriginal ?? false}
            />
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              النسبة الحالية: <span className="text-primary font-bold">{settings.muteOriginal ? "مكتوم" : `${settings.originalVolume ?? 90}%`}</span>
              {" · "}100% = الصوت الأصلي · أكثر = تضخيم · أقل = تخفيف
            </p>
          </div>

          {/* Duaa TTS audio */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">🤲 صوت الدعاء (TTS)</span>
              <button
                onClick={() => handleSettingChange({...settings, muteDuaa: !(settings.muteDuaa ?? false)})}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                  (settings.muteDuaa ?? false)
                    ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
                    : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                )}
              >
                {(settings.muteDuaa ?? false)
                  ? <><VolumeX className="w-3.5 h-3.5" /> مكتوم</>
                  : <><Volume2 className="w-3.5 h-3.5" /> مفعّل</>
                }
              </button>
            </div>
            <Slider
              label=""
              min={0} max={300} step={5}
              value={settings.duaaVolume ?? 120}
              onChange={(v: number) => handleSettingChange({...settings, duaaVolume: v})}
              unit="%"
              disabled={settings.muteDuaa ?? false}
            />
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              النسبة الحالية: <span className="text-primary font-bold">{settings.muteDuaa ? "مكتوم" : `${settings.duaaVolume ?? 120}%`}</span>
              {" · "}100% = الصوت الطبيعي · أكثر = تقوية صوت الدعاء
            </p>
          </div>
        </div>
      </PremiumCard>

      {/* ── Processing Settings ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <PremiumCard title="جودة المعالجة والفيديو" icon={Video}>
          <div className="space-y-8">
             <Select
               label="جودة تصيير الفيديو"
               value={settings.videoQuality || "fast"}
               onChange={(v: string) => handleSettingChange({...settings, videoQuality: v})}
               options={[
                 {label: "فائق السرعة (ultrafast)", value: "ultrafast"},
                 {label: "سريع جداً (superfast)", value: "superfast"},
                 {label: "سريع (fast)", value: "fast"},
                 {label: "متوسط - جودة أعلى (medium)", value: "medium"}
               ]}
             />
             <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
               <p className="text-sm font-bold text-primary/80 leading-relaxed">
                 تحدد هذه القيمة التوازن بين سرعة المعالجة وجودة الفيديو النهائي. الخيار الافتراضي "سريع" يعتبر الأفضل لمعظم الاستخدامات.
               </p>
             </div>
          </div>
        </PremiumCard>

        <PremiumCard title="تأثيرات خلفية النص" icon={SlidersHorizontal}>
          <div className="space-y-8">
             <Switch
               label="تفعيل طبقة التظليل خلف النص"
               checked={settings.showBackground ?? true}
               onChange={(v: boolean) => handleSettingChange({...settings, showBackground: v})}
             />

             <div className="pt-2">
               <Slider
                 label="مستوى شفافية التظليل"
                 min={0} max={100} step={1}
                 value={settings.bgOpacity ?? 40}
                 onChange={(v: number) => handleSettingChange({...settings, bgOpacity: v})}
                 unit="%"
                 disabled={!(settings.showBackground ?? true)}
               />
             </div>

             <div className="p-4 bg-black/30 rounded-xl border border-border">
               <p className="text-sm font-bold text-muted-foreground leading-relaxed">
                 تساعد طبقة التظليل الداكنة خلف النص على جعله أكثر قابلية للقراءة عندما تكون ألوان الفيديو ساطعة جداً.
               </p>
             </div>
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
