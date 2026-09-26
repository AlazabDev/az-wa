import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/pages/Settings";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  ),
});
