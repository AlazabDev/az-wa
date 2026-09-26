import { createFileRoute } from "@tanstack/react-router";
import Flows from "@/pages/Flows";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/flows/")({
  head: () => ({ meta: [{ title: "التدفقات — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Flows />
    </RequireAuth>
  ),
});
