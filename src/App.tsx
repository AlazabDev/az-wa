import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/flows" element={<Flows />} />
          <Route path="/flows/new" element={<FlowBuilder />} />
          <Route path="/webhooks" element={<Webhooks />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
