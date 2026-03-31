import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/layout";
import { Dashboard } from "@/pages/dashboard";
import { AdvancedSettings } from "@/pages/advanced-settings";
import { Guide } from "@/pages/guide";
import { Analytics } from "@/pages/analytics";
import { SmartBot } from "@/pages/smart-bot";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/settings" component={AdvancedSettings} />
        <Route path="/guide" component={Guide} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/smart-bot" component={SmartBot} />
        <Route>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in zoom-in duration-500">
            <h1 className="text-9xl font-black mb-6 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/20">404</h1>
            <p className="text-2xl font-bold text-muted-foreground">عذراً، الصفحة التي تبحث عنها غير موجودة.</p>
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
