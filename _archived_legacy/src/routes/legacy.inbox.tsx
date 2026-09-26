import { createFileRoute } from "@tanstack/react-router";
import Inbox from "@/pages/Inbox";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/inbox")({
  head: () => ({ meta: [{ title: "صندوق الوارد — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Inbox />
    </RequireAuth>
  ),
});
