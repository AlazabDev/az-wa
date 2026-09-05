import { createFileRoute } from "@tanstack/react-router";
import Finance from "@/pages/Finance";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/finance")({
  head: () => ({ meta: [{ title: "المالية — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Finance />
    </RequireAuth>
  ),
});
