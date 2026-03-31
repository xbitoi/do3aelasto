import { PremiumCard } from "@/components/ui-elements";
import { BookOpen, Key, Paintbrush, Send, Sparkles, Server } from "lucide-react";

export function Guide() {
  const steps = [
    {
      title: "الخطوة الأولى: إعداد مفاتيح الاتصال (API)",
      desc: "احصل على مفتاح Gemini من منصة Google AI Studio، ثم احصل على توكن بوت تيليغرام الخاص بك من @BotFather في تطبيق تيليغرام. أدخل المفتاحين في لوحة التحكم وتأكد من عملهما باختبار الاتصال.",
      icon: Key
    },
    {
      title: "الخطوة الثانية: تخصيص مظهر الفيديو",
      desc: "استخدم لوحة التحكم لتخصيص كيفية ظهور النص والدعاء على الفيديو. يمكنك تغيير الخط، الحجم، الألوان، الموضع، وإضافة تأثيرات حدودية للنص لضمان الجمالية والوضوح.",
      icon: Paintbrush
    },
    {
      title: "الخطوة الثالثة: تشغيل الخادم",
      desc: "بمجرد تجهيز الإعدادات، اضغط على زر 'تشغيل البوت'. سيتحول لون المؤشر إلى الأخضر ويصبح البوت في حالة استماع مستمر لرسائل المستخدمين الواردة.",
      icon: Server
    },
    {
      title: "الخطوة الرابعة: التفاعل مع البوت",
      desc: "افتح تطبيق تيليغرام، ابحث عن البوت الخاص بك وابدأ المحادثة عبر إرسال أمر /start. بعد ذلك، قم بإرسال أي فيديو قصير (يفضل أن يكون حوالي 10 ثوانٍ) مباشرة للبوت.",
      icon: Send
    },
    {
      title: "الخطوة الخامسة: سحر الذكاء الاصطناعي",
      desc: "سيقوم البوت باستقبال الفيديو، وتوليد دعاء بالتشكيل الكامل بناءً على النمط المختار، ثم تحويله إلى مقطع صوتي احترافي، ودمج النص مع الفيديو وإبراز الكلمات بشكل متزامن مع القراءة!",
      icon: Sparkles
    }
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-5xl pb-20">
      <div className="mb-10">
        <h2 className="text-2xl sm:text-4xl font-black mb-2 sm:mb-3 tracking-tight text-foreground">دليل الاستخدام الشامل</h2>
        <p className="text-lg font-semibold text-muted-foreground">تعرف على كيفية إعداد واستخدام استوديو البوت بخطوات واضحة وبسيطة</p>
      </div>

      <div className="grid gap-6">
        {steps.map((step, i) => (
          <div key={i} className="bg-card border border-border p-8 rounded-[2rem] flex flex-col md:flex-row items-start gap-8 hover:border-primary/50 transition-all duration-500 shadow-xl group">
            <div className="bg-gradient-to-br from-primary/20 to-transparent text-primary p-5 rounded-2xl shrink-0 border border-primary/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
              <step.icon className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-black mb-4 text-foreground group-hover:text-primary transition-colors">{step.title}</h3>
              <p className="text-muted-foreground font-semibold leading-relaxed text-lg">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
      
      <PremiumCard className="mt-12 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
        <div className="flex items-center gap-4 text-foreground mb-4">
          <BookOpen className="w-8 h-8 text-primary" />
          <h3 className="text-2xl font-black">نصائح للحصول على أفضل نتيجة</h3>
        </div>
        <ul className="space-y-3 font-semibold text-muted-foreground text-lg list-disc list-inside mr-6">
          <li>اختر خط <strong>BeIn</strong> للنصوص الرسمية والواضحة، أو <strong>Dima</strong> للأدعية التي تتطلب طابعاً قرآنياً تقليدياً.</li>
          <li>تأكد من تفعيل "طبقة التظليل" في الإعدادات المتقدمة إذا كانت الفيديوهات التي ترسلها ساطعة جداً.</li>
          <li>استخدم لون نص أساسي فاتح (مثل الأبيض) ولون نشط مميز (مثل الأزرق السماوي أو الذهبي) لتباين ممتاز.</li>
        </ul>
      </PremiumCard>
    </div>
  )
}
