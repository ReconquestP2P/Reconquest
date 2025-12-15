import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import About from "@/pages/about";
import SignUp from "@/pages/signup";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import BorrowerDashboard from "@/pages/borrower-dashboard";
import LenderDashboard from "@/pages/lender-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import MyAccount from "@/pages/my-account";
import ConfirmDetailsChange from "@/pages/confirm-details-change";
import Navigation from "@/components/navigation";

function Router() {
  return (
    <div className="min-h-screen bg-gradient-hero dark:bg-gray-900">
      <Navigation />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/signup" component={SignUp} />
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/borrower" component={BorrowerDashboard} />
        <Route path="/lender" component={LenderDashboard} />
        <Route path="/my-account" component={MyAccount} />
        <Route path="/confirm-details-change" component={ConfirmDetailsChange} />

        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin-dashboard" component={AdminDashboard} />

        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="light" storageKey="reconquest-ui-theme">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
