import { createFileRoute } from "@tanstack/react-router";
import Projects from "@/pages/Projects";
import { RequireAuth } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/legacy/projects")({
  head: () => ({ meta: [{ title: "المشاريع — WhatsApp Business Hub" }] }),
  component: () => (
    <RequireAuth>
      <Projects />
    </RequireAuth>
  ),
});
