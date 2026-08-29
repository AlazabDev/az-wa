import { createFileRoute } from "@tanstack/react-router";
import Maintenance from "@/pages/Maintenance";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/maintenance")({
  head: () => ({ meta: [{ title: "الصيانة — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Maintenance />
    </RequireAuth>
  ),
});
