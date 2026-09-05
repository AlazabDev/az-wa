import { createFileRoute } from "@tanstack/react-router";
import FlowBuilder from "@/pages/FlowBuilder";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/flows/new")({
  head: () => ({ meta: [{ title: "منشئ التدفق — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <FlowBuilder />
    </RequireAuth>
  ),
});
