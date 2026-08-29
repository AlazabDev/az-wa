import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/legacy/flows")({
  component: () => <Outlet />,
});
