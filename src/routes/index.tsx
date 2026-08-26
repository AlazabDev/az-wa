import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AzWA — WhatsApp Business Operations OS" },
      {
        name: "description",
        content:
          "AzWA is the central control plane for every WhatsApp Business portfolio, WABA and phone number: inbox, templates, campaigns, webhooks, health and analytics.",
      },
      { property: "og:title", content: "AzWA — WhatsApp Business Operations OS" },
      {
        property: "og:description",
        content: "Central control plane for all WhatsApp Business accounts and numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
