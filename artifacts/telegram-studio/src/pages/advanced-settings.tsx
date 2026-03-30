import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import type { AppSettings } from "@workspace/api-client-react/src/generated/api.schemas";
import { PremiumCard, PremiumButton, Slider, Select, Switch } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { Save, Video, SlidersHorizontal } from "lucide-react";

export function AdvancedSettings() {
  const { data: serverSettings, isLoading } = useGetSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (serverSettings) setSettings(serverSettings);
  }, [serverSettings]);

  if (!settings || isLoading) {
    return <div className="animate-pulse h-[600px] bg-card rounded-[2rem]" />;
  }

  const handleSave = () => {
    updateSettings({ data: settings }, {
      onSuccess: () => toast({ title: "اكتمل الحفظ", description: "تم حفظ الإعدادات المتقدمة بنجاح وتطبيقها" }),
      onError: () => toast({ title: "خطأ", description: "فشل حفظ الإعدادات المتقدمة", variant: "destructive" })
    });
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-4xl">
      <div className="mb-10">
        <h2 className="text-4xl font-black mb-3 tracking-tight text-foreground">الإعدادات المتقدمة</h2>
        <p className="text-lg font-semibold text-muted-foreground">تحكم في خيارات العرض المتقدمة وجودة الفيديو المستخرج</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <PremiumCard title="جودة المعالجة والفيديو" icon={Video}>
          <div className="space-y-8">
             <Select 
               label="جودة تصيير الفيديو" 
               value={settings.videoQuality || "fast"} 
               onChange={(v: string) => setSettings({...settings, videoQuality: v})} 
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
               onChange={(v: boolean) => setSettings({...settings, showBackground: v})} 
             />
             
             <div className="pt-2">
               <Slider 
                 label="مستوى شفافية التظليل" 
                 min={0} max={100} step={1} 
                 value={settings.bgOpacity ?? 40} 
                 onChange={(v: number) => setSettings({...settings, bgOpacity: v})} 
                 unit="%" 
                 disabled={!(settings.showBackground ?? true)} 
               />
             </div>
             
             <div className="p-4 bg-black/30 rounded-xl border border-border">
               <p className="text-sm font-bold text-muted-foreground leading-relaxed">
                 تساعد طبقة التظليل الداكنة خلف النص على جعله أكثر قابلية للقراءة عندما تكون ألوان الفيديو ساطعة جداً أو مشابهة للون النص.
               </p>
             </div>
          </div>
        </PremiumCard>
      </div>

      <div className="flex justify-start pt-6">
        <PremiumButton onClick={handleSave} isLoading={isPending} className="w-full md:w-auto md:min-w-[240px] shadow-2xl">
          <Save className="w-5 h-5" />
          حفظ التغييرات
        </PremiumButton>
      </div>
    </div>
  );
}
