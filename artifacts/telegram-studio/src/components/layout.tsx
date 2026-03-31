import { Link, useLocation } from "wouter";
import { Bot, Settings, BookOpen, BarChart2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  
  const navItems = [
    { href: "/", label: "لوحة التحكم", icon: Bot },
    { href: "/smart-bot", label: "البوت الذكي", icon: Brain },
    { href: "/analytics", label: "تحليل الأداء", icon: BarChart2 },
    { href: "/settings", label: "إعدادات متقدمة", icon: Settings },
    { href: "/guide", label: "دليل الاستخدام", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      <aside className="w-full lg:w-80 bg-card border-l border-border flex flex-col shadow-2xl z-20">
        <div className="p-8 pb-6">
          <div className="flex items-center gap-4 text-primary mb-3">
            <div className="p-3 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-lg shadow-primary/20 border border-white/10">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-l from-white to-white/70">استوديو البوت</h1>
          </div>
          <p className="text-sm font-bold text-muted-foreground pr-1">لوحة تحكم تيليغرام الذكية</p>
        </div>
        
        <nav className="flex-1 px-5 space-y-2 mt-6">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 font-bold text-base",
                isActive 
                  ? "bg-gradient-to-r from-primary/15 to-transparent text-primary border border-primary/20 shadow-sm" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground hover:translate-x-1"
              )}>
                <item.icon className={cn("w-6 h-6", isActive ? "text-primary" : "opacity-70")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-8 mt-auto hidden lg:block">
          <div className="bg-black/30 rounded-2xl p-6 border border-border/50 text-center shadow-inner relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">الإصدار 2.0</div>
            <div className="text-sm font-black bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent leading-relaxed">
              Telegram Studio<br/>AI Smart Bot
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 sm:p-10 lg:p-12 overflow-y-auto h-screen relative">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-[1600px] mx-auto relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
