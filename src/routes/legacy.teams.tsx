import { createFileRoute } from "@tanstack/react-router";
import Teams from "@/pages/Teams";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/teams")({
  head: () => ({ meta: [{ title: "الفرق — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Teams />
    </RequireAuth>
  ),
});
