import { createFileRoute } from "@tanstack/react-router";
import Webhooks from "@/pages/Webhooks";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/webhooks")({
  head: () => ({ meta: [{ title: "الويب هوك — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Webhooks />
    </RequireAuth>
  ),
});
