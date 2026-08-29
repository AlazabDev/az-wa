import { createFileRoute } from "@tanstack/react-router";
import Templates from "@/pages/Templates";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/templates")({
  head: () => ({ meta: [{ title: "القوالب — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Templates />
    </RequireAuth>
  ),
});
