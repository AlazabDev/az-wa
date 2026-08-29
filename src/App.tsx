import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Finance from "./pages/Finance";
import Accounts from "./pages/Accounts";
import Templates from "./pages/Templates";
import Flows from "./pages/Flows";
import FlowBuilder from "./pages/FlowBuilder";
import Projects from "./pages/Projects";
import Clients from "./pages/Clients";
import Maintenance from "./pages/Maintenance";
import Teams from "./pages/Teams";
import Webhooks from "./pages/Webhooks";
import Inbox from "./pages/Inbox";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/settings" element={<Settings />} />
              {import.meta.env.DEV && <>
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/flows" element={<Flows />} />
                <Route path="/flows/new" element={<FlowBuilder />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route path="/teams" element={<Teams />} />
              </>}
            </Route>
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
