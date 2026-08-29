import { createFileRoute } from "@tanstack/react-router";
import Accounts from "@/pages/Accounts";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/accounts")({
  head: () => ({ meta: [{ title: "الحسابات — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Accounts />
    </RequireAuth>
  ),
});
