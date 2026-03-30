import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, ChevronDown } from "lucide-react";

export function PremiumCard({ children, className, title, icon: Icon }: any) {
  return (
    <div className={cn("relative group rounded-[2rem] bg-card border border-border p-6 sm:p-8 shadow-2xl overflow-hidden", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      {title && (
        <div className="flex items-center gap-4 mb-8 relative z-10">
          {Icon && (
            <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20 shadow-inner">
              <Icon className="w-5 h-5 text-primary" />
            </div>
          )}
          <h3 className="text-xl font-black text-foreground tracking-tight">{title}</h3>
        </div>
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export function PremiumButton({ children, variant = 'primary', isLoading, className, ...props }: any) {
  const variants = {
    primary: "bg-gradient-to-r from-primary to-accent text-white shadow-xl shadow-primary/25 hover:shadow-primary/40 border border-white/10",
    secondary: "bg-black/30 text-secondary-foreground hover:bg-black/50 border border-border shadow-md",
    destructive: "bg-gradient-to-r from-destructive to-red-600 text-white shadow-xl shadow-destructive/25 hover:shadow-destructive/40 border border-white/10",
  };
  
  return (
    <button 
      disabled={isLoading || props.disabled}
      className={cn(
        "relative px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all duration-300 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden",
        variants[variant as keyof typeof variants],
        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {!isLoading && children}
    </button>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex w-full rounded-xl border border-border bg-black/40 px-5 py-4 text-sm font-semibold transition-all hover:border-border/80 focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 text-foreground placeholder:text-muted-foreground/50 shadow-inner",
          className
        )}
        {...props}
      />
    )
  }
)

export function Slider({ value, min, max, step, onChange, label, unit, disabled }: any) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-foreground/80">{label}</label>
        <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md font-mono font-black border border-primary/20">
          {value}{unit}
        </span>
      </div>
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer accent-primary disabled:opacity-50 border border-border/50"
      />
    </div>
  );
}

export function ColorPicker({ value, onChange, label }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground/80">{label}</label>
      <div className="flex items-center gap-3">
        <div className="relative overflow-hidden rounded-lg w-11 h-9 border border-border shrink-0 cursor-pointer shadow-sm hover:border-primary/50 transition-colors">
          <input 
            type="color" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-3 w-20 h-16 cursor-pointer"
          />
        </div>
        <Input 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-left tracking-wider uppercase text-xs py-2"
          dir="ltr"
        />
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, label }: any) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-bold text-foreground/80">{label}</label>}
      <div className="relative">
        <select 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-black/40 border border-border rounded-xl px-4 py-2.5 pl-10 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground text-sm font-bold shadow-inner cursor-pointer hover:border-border/80"
        >
          {options.map((opt: any) => (
            <option key={opt.value} value={opt.value} className="bg-card text-foreground font-semibold">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-muted-foreground">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: any) {
  return (
    <label className={cn("flex items-center justify-between cursor-pointer group p-2 -m-2 rounded-xl transition-colors hover:bg-white/5", disabled && "opacity-50 cursor-not-allowed")}>
      <span className="text-sm font-bold text-foreground/90 group-hover:text-foreground transition-colors">{label}</span>
      <div className="relative shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <div className={cn("block w-14 h-8 rounded-full transition-all duration-300 shadow-inner", checked ? "bg-gradient-to-r from-primary to-accent" : "bg-black/50 border border-border/80")} />
        <div className={cn("absolute top-1 w-6 h-6 rounded-full bg-white transition-all duration-300 shadow-md", checked ? "right-7" : "right-1")} />
      </div>
    </label>
  );
}
