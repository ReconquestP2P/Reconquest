import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import BorrowerDashboard from "@/pages/borrower-dashboard";
import LenderDashboard from "@/pages/lender-dashboard";
import PriceOracle from "@/pages/price-oracle";

import Navigation from "@/components/navigation";

function Router() {
  return (
    <div className="min-h-screen bg-gradient-hero">
      <Navigation />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/borrower" component={BorrowerDashboard} />
        <Route path="/lender" component={LenderDashboard} />
        <Route path="/price-oracle" component={PriceOracle} />

        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
