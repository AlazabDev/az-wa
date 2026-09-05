import { createFileRoute } from "@tanstack/react-router";
import Clients from "@/pages/Clients";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/clients")({
  head: () => ({ meta: [{ title: "العملاء — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Clients />
    </RequireAuth>
  ),
});
