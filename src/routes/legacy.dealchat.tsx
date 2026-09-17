import { createFileRoute } from "@tanstack/react-router";
import DealChat from "@/pages/DealChat";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/dealchat")({
  head: () => ({ meta: [{ title: "ديل شات — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <DealChat />
    </RequireAuth>
  ),
});
