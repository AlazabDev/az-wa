import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, ShieldCheck, Video } from "lucide-react";

import { AppReviewRecorder } from "@/components/azwa/app-review-recorder";
import { PageHeader, Panel } from "@/components/azwa/page-header";
import { Button } from "@/components/ui/button";

type ReviewStatus = "ready" | "backend-required";

type ReviewScenario = {
  id: string;
  label: string;
  family: "Facebook Login" | "Facebook Pages" | "Instagram" | "Messenger" | "WhatsApp" | "Business";
  status: ReviewStatus;
  dependency?: string;
  purpose: string;
  recordingSteps: string[];
  apiProof: string;
  demoPath?: string;
  testCallRequired?: boolean;
};

const SCENARIOS: ReviewScenario[] = [
  {
    id: "business-asset-user-profile-access",
    label: "Business Asset User Profile Access",
    family: "Facebook Pages",
    status: "backend-required",
    purpose:
      "Show the name and profile picture of a person who interacts with an Alazab business asset so an operator can identify the customer inside the unified inbox.",
    recordingSteps: [
      "Connect a Facebook Page owned by the business.",
      "Receive a real Messenger interaction or Page engagement from a test user.",
      "Open the customer conversation in AzWA.",
      "Show the customer's Meta user identity, name and profile picture beside the conversation.",
    ],
    apiProof: "Read the interacting user's allowed business-asset profile fields and show them in the AzWA customer record.",
  },
  {
    id: "email",
    label: "email",
    family: "Facebook Login",
    status: "backend-required",
    purpose: "Use the signed-in person's email to identify the authorized AzWA administrator and bind the Meta connection to the correct account.",
    recordingSteps: [
      "Start Facebook Login from AzWA.",
      "Approve the requested login permissions.",
      "Return to AzWA and open the connected-user profile.",
      "Show the returned email associated with the signed-in administrator.",
    ],
    apiProof: "Read the authenticated user's email after Facebook Login and display it in the connected-user profile.",
  },
  {
    id: "instagram-business-basic",
    label: "instagram_business_basic",
    family: "Instagram",
    status: "backend-required",
    purpose: "Connect an Instagram professional account and display its identity and account information inside AzWA.",
    recordingSteps: [
      "Start Business Login for Instagram.",
      "Authorize the Instagram professional account.",
      "Return to AzWA and select the connected Instagram account.",
      "Show the account identity and basic profile information returned by Instagram.",
    ],
    apiProof: "Fetch and display the connected Instagram professional account identity using the Instagram API.",
  },
  {
    id: "instagram-business-manage-messages",
    label: "instagram_business_manage_messages",
    family: "Instagram",
    status: "backend-required",
    dependency: "instagram_business_basic",
    purpose: "Receive Instagram Direct conversations in the unified inbox and let an operator reply to a customer who initiated the conversation.",
    recordingSteps: [
      "Send a DM from a test Instagram user to the connected professional account.",
      "Open Instagram Inbox in AzWA and show the incoming conversation.",
      "Open the conversation and type a reply.",
      "Send the reply and show the resulting message status / Meta message identifier.",
    ],
    apiProof: "List an Instagram conversation and send a reply through the Instagram messaging API.",
    testCallRequired: true,
  },
  {
    id: "instagram-manage-comments",
    label: "instagram_manage_comments",
    family: "Instagram",
    status: "backend-required",
    dependency: "instagram_basic",
    purpose: "Load comments from media owned by the connected Instagram professional account and let an authorized operator manage the conversation around those comments.",
    recordingSteps: [
      "Connect the Instagram professional account through the Facebook-login based flow used by this permission.",
      "Open an owned Instagram post in AzWA.",
      "Load its comments from Meta.",
      "Show a test comment and perform the supported comment-management action from AzWA.",
    ],
    apiProof: "Fetch comments for an owned Instagram media object and perform the review-approved management action.",
    testCallRequired: true,
  },
  {
    id: "marketing-messages-messenger",
    label: "marketing_messages_messenger",
    family: "Messenger",
    status: "backend-required",
    dependency: "ads_management",
    purpose: "Create and manage paid Messenger marketing messages for people who have opted in to receive promotional announcements from the business.",
    recordingSteps: [
      "Select an authorized ad account and Facebook Page.",
      "Open the paid Messenger marketing-message composer.",
      "Select an eligible opted-in audience and create the message/campaign.",
      "Show the submitted campaign and its delivery/performance state returned by Meta.",
    ],
    apiProof: "Create/manage a paid Messenger marketing message with an authorized ad account and display its Meta status/performance.",
  },
  {
    id: "pages-show-list",
    label: "pages_show_list",
    family: "Facebook Pages",
    status: "backend-required",
    purpose: "Show the signed-in administrator the Facebook Pages they manage so they can select the Page to connect to AzWA.",
    recordingSteps: [
      "Start Facebook Login from the Add Facebook Page screen.",
      "Complete the authorization flow.",
      "Return to AzWA.",
      "Show the real list of Pages managed by the signed-in person and select one Page.",
    ],
    apiProof: "Fetch the Pages managed by the signed-in user and render them in the Page selector.",
  },
  {
    id: "pages-manage-metadata",
    label: "pages_manage_metadata",
    family: "Facebook Pages",
    status: "backend-required",
    dependency: "pages_show_list",
    purpose: "Subscribe the selected Facebook Page to AzWA webhooks and show that Page events are received by the application.",
    recordingSteps: [
      "Select a Page already returned by the Page selector.",
      "Open Webhook Setup for that Page.",
      "Subscribe the AzWA Meta app to the Page.",
      "Generate a test Page/Messenger event and show the received webhook event in AzWA.",
    ],
    apiProof: "Subscribe the selected Page to the app and show the resulting subscription plus a received webhook event.",
    testCallRequired: true,
  },
  {
    id: "pages-messaging",
    label: "pages_messaging",
    family: "Messenger",
    status: "backend-required",
    dependency: "pages_manage_metadata + pages_show_list",
    purpose: "Receive and manage user-initiated Facebook Page Messenger conversations and send customer-support replies from AzWA.",
    recordingSteps: [
      "Send a Messenger message from a test user to the connected Facebook Page.",
      "Open Messenger Inbox in AzWA and show the incoming conversation.",
      "Open the conversation and reply from AzWA.",
      "Show that the reply appears in Messenger and that AzWA records the delivery state.",
    ],
    apiProof: "Read a Page conversation and send a Page Messenger reply using the connected Page access token.",
    testCallRequired: true,
  },
  {
    id: "business-management",
    label: "business_management",
    family: "Business",
    status: "backend-required",
    purpose: "Read the Alazab business portfolio and authorized assets required to connect the correct Pages, ad accounts and messaging assets to AzWA.",
    recordingSteps: [
      "Open Business Assets in AzWA.",
      "Authenticate the authorized business administrator.",
      "Load the business portfolio and its supported assets from Meta.",
      "Select an asset and show how it becomes available to the related AzWA integration.",
    ],
    apiProof: "Read the authorized Meta business portfolio/assets and bind the chosen asset to the AzWA organization.",
    testCallRequired: true,
  },
  {
    id: "whatsapp-business-messaging",
    label: "whatsapp_business_messaging",
    family: "WhatsApp",
    status: "ready",
    purpose: "Send and receive WhatsApp Business messages through the authorized Alazab phone numbers managed by AzWA.",
    recordingSteps: [
      "Open Inbox and choose an enabled WhatsApp sender.",
      "Send an approved test message to a test recipient.",
      "Show the Meta message identifier and outbound state in Message Outbox.",
      "Reply from the test WhatsApp account and show the inbound message arriving through the webhook.",
    ],
    apiProof: "Send a Cloud API message and receive the corresponding message/webhook state in AzWA.",
    demoPath: "/inbox",
    testCallRequired: true,
  },
  {
    id: "public-profile",
    label: "public_profile",
    family: "Facebook Login",
    status: "backend-required",
    purpose: "Authenticate the Meta administrator and display the default public profile identity used by AzWA for the connected Meta session.",
    recordingSteps: [
      "Start Facebook Login from AzWA.",
      "Complete authentication.",
      "Return to the connected-user profile.",
      "Show the returned app-scoped user ID, name and profile picture.",
    ],
    apiProof: "Read the authenticated user's default public profile fields and display them in AzWA.",
  },
  {
    id: "whatsapp-business-management",
    label: "whatsapp_business_management",
    family: "WhatsApp",
    status: "ready",
    purpose: "Manage the authorized WhatsApp Business Accounts, phone numbers, templates, flows and operational metadata used by AzWA.",
    recordingSteps: [
      "Open WhatsApp Infrastructure and show the connected WABAs.",
      "Open Phone Numbers and show the Meta phone-number IDs and current API status.",
      "Run Test API for a review/test number.",
      "Open Templates and sync the selected WABA from Meta to prove management access.",
    ],
    apiProof: "Read WABA/phone-number assets and execute a management operation such as template synchronization.",
    demoPath: "/numbers",
    testCallRequired: true,
  },
  {
    id: "business-description",
    label: "Business description",
    family: "Business",
    status: "ready",
    purpose:
      "Alazab Group uses AzWA as a unified business messaging operations platform to connect and operate authorized WhatsApp, Messenger, Facebook Page and Instagram business assets for customer service, operational messaging and approved marketing workflows.",
    recordingSteps: [
      "Open the AzWA Operations Overview.",
      "Show the organization scope and authorized messaging assets.",
      "Explain that each channel is connected only after an authorized business administrator grants access.",
      "Show that credentials are resolved server-side and are not exposed in the browser.",
    ],
    apiProof: "No separate permission API call; this scenario documents the business use case and navigation used throughout App Review.",
    demoPath: "/dashboard",
  },
];

export const Route = createFileRoute("/_authenticated/app-review")({
  head: () => ({ meta: [{ title: "Meta App Review Studio — AzWA" }] }),
  component: AppReviewPage,
});

function AppReviewPage() {
  const [selectedId, setSelectedId] = useState(SCENARIOS[0]?.id ?? "");
  const selected = useMemo(
    () => SCENARIOS.find((scenario) => scenario.id === selectedId) ?? SCENARIOS[0],
    [selectedId],
  );

  if (!selected) return null;

  const readyCount = SCENARIOS.filter((scenario) => scenario.status === "ready").length;

  return (
    <>
      <PageHeader
        title="Meta App Review Studio"
        description="Dedicated reviewer-facing scenarios for recording permission videos. Every scenario must demonstrate a real user flow and real Meta API result; a static mock is not marked ready."
        actions={<AppReviewRecorder scenario={selected.id} />}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Review scenarios</p>
          <p className="mt-1 text-2xl font-semibold">{SCENARIOS.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">UI/API ready now</p>
          <p className="mt-1 text-2xl font-semibold">{readyCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Backend still required</p>
          <p className="mt-1 text-2xl font-semibold">{SCENARIOS.length - readyCount}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Permissions & features">
          <div className="space-y-2">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setSelectedId(scenario.id)}
                className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                  selected.id === scenario.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold">{scenario.label}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{scenario.family}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      scenario.status === "ready"
                        ? "bg-success/15 text-success"
                        : "bg-warning/15 text-warning-foreground"
                    }`}
                  >
                    {scenario.status === "ready" ? "READY" : "BACKEND"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            title={selected.label}
            actions={
              selected.demoPath ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={selected.demoPath}>
                    Open live demo <ExternalLink className="ml-2 size-3.5" />
                  </Link>
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                  {selected.family}
                </span>
                {selected.dependency ? (
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                    Requires: {selected.dependency}
                  </span>
                ) : null}
                {selected.testCallRequired ? (
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                    API test call required
                  </span>
                ) : null}
              </div>

              <div>
                <h3 className="text-sm font-semibold">How AzWA uses it</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{selected.purpose}</p>
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Video className="size-4" /> Recording walkthrough
                </h3>
                <ol className="mt-2 space-y-2">
                  {selected.recordingSteps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">
                        {index + 1}
                      </span>
                      <span className="pt-0.5 text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="size-4" /> API evidence required in the video
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{selected.apiProof}</p>
              </div>

              {selected.status === "ready" ? (
                <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  <p>
                    The existing AzWA UI has a usable demonstration path for this item. Final recording still requires valid live/test Meta credentials and review-safe test assets.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                  <strong>Not ready for submission yet.</strong> The reviewer-facing screen is defined, but the corresponding Facebook/Instagram/Messenger backend adapter and real API proof still have to be connected before recording.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Recording control">
            <AppReviewRecorder scenario={selected.id} />
          </Panel>
        </div>
      </div>
    </>
  );
}
