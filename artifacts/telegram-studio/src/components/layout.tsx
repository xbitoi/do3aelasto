import { Link, useLocation } from "wouter";
import {
  Bot, Settings, BookOpen, BarChart2, Brain,
  Sun, Moon, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";
import { useTheme } from "@/hooks/use-theme";

// ─── Navigation items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/",          label: "التحكم",   labelFull: "لوحة التحكم",    icon: Bot,       group: "رئيسي" },
  { href: "/smart-bot", label: "البوت",    labelFull: "البوت الذكي",    icon: Brain,     group: "رئيسي" },
  { href: "/analytics", label: "الأداء",   labelFull: "تحليل الأداء",   icon: BarChart2, group: "رئيسي" },
  { href: "/settings",  label: "الإعدادات", labelFull: "إعدادات متقدمة", icon: Settings,  group: "أدوات" },
  { href: "/guide",     label: "الدليل",   labelFull: "دليل الاستخدام", icon: BookOpen,  group: "أدوات" },
];

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      className={cn(
        "flex items-center gap-2 rounded-xl border font-bold text-sm transition-all duration-200",
        "hover:scale-[1.02] active:scale-[0.98] select-none",
        compact
          ? "p-2.5"
          : "px-4 py-2.5 w-full justify-center",
        isDark
          ? "bg-white/5 border-white/10 text-foreground hover:bg-white/10"
          : "bg-black/5 border-black/10 text-foreground hover:bg-black/8"
      )}
    >
      {isDark
        ? <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
        : <Sun  className="w-4 h-4 text-amber-500 shrink-0" />
      }
      {!compact && (
        <span>{isDark ? "الوضع الليلي" : "الوضع النهاري"}</span>
      )}
    </button>
  );
}

// ─── Desktop Sidebar Content ──────────────────────────────────────────────────

function SidebarContent() {
  const [location] = useLocation();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const groups = ["رئيسي", "أدوات"];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg border border-white/10 shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black text-foreground leading-tight truncate">استوديو البوت</h1>
            <p className="text-[10px] font-semibold text-muted-foreground">لوحة تحكم تيليغرام</p>
          </div>
        </div>
      </div>

      <div className="mx-5 h-px bg-border/50" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {groups.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group);
          return (
            <div key={group}>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 px-3 mb-1.5 select-none">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = location === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all duration-200",
                        active
                          ? cn(
                              "text-primary",
                              isDark
                                ? "bg-primary/12 border border-primary/20"
                                : "bg-primary/10 border border-primary/15"
                            )
                          : cn(
                              "text-muted-foreground border border-transparent",
                              isDark ? "hover:bg-white/5 hover:text-foreground" : "hover:bg-black/4 hover:text-foreground"
                            )
                      )}
                    >
                      <span className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-all",
                        active
                          ? isDark ? "bg-primary/20 text-primary" : "bg-primary/15 text-primary"
                          : isDark
                            ? "bg-white/5 text-muted-foreground group-hover:bg-white/10 group-hover:text-foreground"
                            : "bg-black/5 text-muted-foreground group-hover:bg-black/8 group-hover:text-foreground"
                      )}>
                        <item.icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 truncate">{item.labelFull}</span>
                      {active && <ChevronLeft className="w-3 h-3 text-primary/50 shrink-0" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mx-5 h-px bg-border/50" />

      {/* Footer */}
      <div className="px-3 py-4 space-y-2">
        <ThemeToggle />
        <div className={cn(
          "rounded-xl px-4 py-3 text-center border",
          isDark ? "bg-white/[0.03] border-white/8" : "bg-black/[0.025] border-black/8"
        )}>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mb-0.5">الإصدار 2.0</p>
          <p className="text-[11px] font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Telegram Studio · AI Smart Bot
          </p>
        </div>
      </div>

    </div>
  );
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────

function BottomNav() {
  const [location] = useLocation();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <nav className={cn(
      "lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t",
      "pb-safe", // safe area for iOS
      isDark
        ? "bg-sidebar-bg/95 backdrop-blur-xl border-border/60"
        : "bg-white/95 backdrop-blur-xl border-border shadow-[0_-1px_12px_rgba(0,0,0,0.08)]"
    )}>
      {NAV_ITEMS.map((item) => {
        const active = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-all duration-200 relative",
              "active:scale-95 select-none min-w-0"
            )}
          >
            {active && (
              <span className={cn(
                "absolute top-0 inset-x-3 h-[2px] rounded-b-full",
                "bg-gradient-to-r from-primary to-accent"
              )} />
            )}
            <span className={cn(
              "flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200",
              active
                ? "bg-gradient-to-br from-primary/30 to-accent/20 text-primary shadow-sm"
                : isDark ? "text-muted-foreground" : "text-muted-foreground"
            )}>
              <item.icon className="w-4.5 h-4.5" />
            </span>
            <span className={cn(
              "text-[10px] font-bold leading-none truncate max-w-full transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [location] = useLocation();

  const currentPage = NAV_ITEMS.find((i) => i.href === location);

  return (
    <div className="min-h-screen flex bg-background">

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col w-64 xl:w-72 shrink-0 border-l h-screen sticky top-0 z-30",
        isDark
          ? "bg-sidebar-bg border-sidebar-border"
          : "bg-white border-border shadow-sm"
      )}>
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile Top Bar */}
        <header className={cn(
          "lg:hidden sticky top-0 z-20 border-b",
          isDark
            ? "bg-background/90 backdrop-blur-xl border-border/50"
            : "bg-white/95 backdrop-blur-xl border-border"
        )}>
          <div className="flex items-center justify-between px-4 h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-black text-sm text-foreground leading-none block">استوديو البوت</span>
                {currentPage && (
                  <span className="text-[10px] text-muted-foreground font-semibold leading-none">{currentPage.labelFull}</span>
                )}
              </div>
            </div>

            {/* Theme toggle */}
            <ThemeToggle compact />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 relative overflow-y-auto">
          {/* Background blobs - dark mode only */}
          {isDark && (
            <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
              <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-primary/6 rounded-full blur-[140px]" />
              <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/6 rounded-full blur-[120px]" />
            </div>
          )}

          {/* Content wrapper — adds bottom padding for the mobile nav bar */}
          <div className="relative z-10 max-w-[1600px] mx-auto px-4 pt-5 pb-28 sm:px-6 sm:pt-8 sm:pb-28 lg:px-10 lg:pt-10 lg:pb-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
