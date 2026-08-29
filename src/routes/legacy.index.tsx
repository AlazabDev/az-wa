import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/pages/Dashboard";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/")({
  head: () => ({ meta: [{ title: "لوحة التحكم — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});
