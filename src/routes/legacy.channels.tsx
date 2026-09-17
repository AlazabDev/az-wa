import { createFileRoute } from "@tanstack/react-router";
import Channels from "@/pages/Channels";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/channels")({
  head: () => ({ meta: [{ title: "القنوات — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Channels />
    </RequireAuth>
  ),
});
