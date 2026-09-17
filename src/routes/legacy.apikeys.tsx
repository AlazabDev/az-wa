import { createFileRoute } from "@tanstack/react-router";
import ApiKeys from "@/pages/ApiKeys";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/apikeys")({
  head: () => ({ meta: [{ title: "مفاتيح API — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <ApiKeys />
    </RequireAuth>
  ),
});
