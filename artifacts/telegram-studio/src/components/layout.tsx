import { Link, useLocation } from "wouter";
import {
  Bot, Settings, BookOpen, BarChart2, Brain,
  Sun, Moon, Menu, X, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { useTheme } from "@/hooks/use-theme";

const NAV_ITEMS = [
  { href: "/",           label: "لوحة التحكم",    icon: Bot,      group: "رئيسي" },
  { href: "/smart-bot",  label: "البوت الذكي",    icon: Brain,    group: "رئيسي" },
  { href: "/analytics",  label: "تحليل الأداء",   icon: BarChart2, group: "رئيسي" },
  { href: "/settings",   label: "إعدادات متقدمة", icon: Settings,  group: "أدوات" },
  { href: "/guide",      label: "دليل الاستخدام", icon: BookOpen,  group: "أدوات" },
];

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "التحويل للوضع النهاري" : "التحويل للوضع الليلي"}
      className={cn(
        "relative flex items-center gap-2 rounded-xl border font-bold text-sm transition-all duration-300",
        "hover:scale-[1.02] active:scale-[0.98]",
        compact
          ? "p-2.5"
          : "px-4 py-2.5 w-full justify-center",
        isDark
          ? "bg-white/5 border-white/10 text-foreground hover:bg-white/10"
          : "bg-black/5 border-black/10 text-foreground hover:bg-black/8"
      )}
    >
      <span className={cn(
        "flex items-center justify-center w-5 h-5 rounded-full transition-transform duration-500",
        isDark ? "rotate-0" : "rotate-180"
      )}>
        {isDark
          ? <Moon className="w-4 h-4 text-indigo-400" />
          : <Sun  className="w-4 h-4 text-amber-500" />
        }
      </span>
      {!compact && (
        <span>{isDark ? "الوضع الليلي" : "الوضع النهاري"}</span>
      )}
    </button>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const [location] = useLocation();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const groups = ["رئيسي", "أدوات"];

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 pt-7 pb-5">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center w-11 h-11 rounded-2xl shadow-lg",
            "bg-gradient-to-br from-primary to-accent border border-white/10"
          )}>
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground leading-tight">استوديو البوت</h1>
            <p className="text-[11px] font-semibold text-muted-foreground">لوحة تحكم تيليغرام</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-border/60 mb-2" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {groups.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group);
          return (
            <div key={group}>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-3 mb-2 select-none">
                {group}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active = location === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavClick}
                      className={cn(
                        "group flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200",
                        active
                          ? [
                              "text-primary shadow-sm",
                              isDark
                                ? "bg-primary/12 border border-primary/20"
                                : "bg-primary/10 border border-primary/15",
                            ]
                          : [
                              "text-muted-foreground",
                              "hover:text-foreground",
                              isDark ? "hover:bg-white/5" : "hover:bg-black/5",
                            ]
                      )}
                    >
                      <span className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                        active
                          ? isDark
                            ? "bg-primary/20 text-primary"
                            : "bg-primary/15 text-primary"
                          : isDark
                            ? "bg-white/5 text-muted-foreground group-hover:bg-white/10 group-hover:text-foreground"
                            : "bg-black/5 text-muted-foreground group-hover:bg-black/8 group-hover:text-foreground"
                      )}>
                        <item.icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {active && (
                        <ChevronLeft className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-6 h-px bg-border/60 mt-2 mb-4" />

      {/* Footer */}
      <div className="px-4 pb-6 space-y-3">
        <ThemeToggle />
        <div className={cn(
          "rounded-xl p-4 text-center border",
          isDark ? "bg-white/[0.03] border-white/8" : "bg-black/[0.03] border-black/8"
        )}>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-1">الإصدار 2.0</p>
          <p className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Telegram Studio · AI Smart Bot
          </p>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="min-h-screen flex bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className={cn(
        "hidden lg:flex flex-col w-72 shrink-0 border-l h-screen sticky top-0 z-30",
        isDark
          ? "bg-[hsl(222_47%_8%)] border-[hsl(217_32%_13%)]"
          : "bg-white border-border shadow-sm"
      )}>
        <SidebarContent />
      </aside>

      {/* ── Mobile Overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile Drawer ── */}
      <aside className={cn(
        "fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col border-l shadow-2xl lg:hidden transition-transform duration-300",
        isDark
          ? "bg-[hsl(222_47%_8%)] border-[hsl(217_32%_13%)]"
          : "bg-white border-border",
        mobileOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <button
          className="absolute top-4 left-4 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent onNavClick={() => setMobileOpen(false)} />
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Mobile Top Bar ── */}
        <header className={cn(
          "lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b backdrop-blur-md",
          isDark
            ? "bg-background/80 border-border/60"
            : "bg-white/90 border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-base text-foreground">استوديو البوت</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <button
              onClick={() => setMobileOpen(true)}
              className={cn(
                "p-2.5 rounded-xl border font-bold transition-all",
                isDark
                  ? "bg-white/5 border-white/10 text-foreground hover:bg-white/10"
                  : "bg-black/5 border-black/10 text-foreground"
              )}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Background blobs (dark only) */}
          {isDark && (
            <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
              <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[140px]" />
              <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/8 rounded-full blur-[120px]" />
            </div>
          )}

          <div className="relative z-10 max-w-[1600px] mx-auto px-4 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
