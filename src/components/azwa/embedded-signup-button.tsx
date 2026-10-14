import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { completeEmbeddedSignup } from "@/lib/meta/embedded-signup.functions";
import { subscribeToEmbeddedSignup, type SignupSessionEvent } from "@/lib/meta/embedded-signup-session";

const APP_ID = "1061494059972503";
const CONFIG_ID = "1815526366103718";
const META_ORIGIN = "https://www.facebook.com";

type FbResponse = { authResponse?: { code?: string }; status?: string };
type FbApi = {
  init: (settings: Record<string, unknown>) => void;
  login: (callback: (response: FbResponse) => void, settings: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    FB?: FbApi;
    fbAsyncInit?: () => void;
  }
}

async function ensureFacebookSdk(): Promise<FbApi> {
  if (window.FB) return window.FB;
  return new Promise<FbApi>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Meta SDK loading timed out")), 12000);
    const previous = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      previous?.();
      if (!window.FB) return;
      window.FB.init({ appId: APP_ID, autoLogAppEvents: false, xfbml: false, version: "v26.0" });
      window.clearTimeout(timeout);
      resolve(window.FB);
    };
    if (!document.querySelector('script[data-azwa-meta-sdk]')) {
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.dataset.azwaMetaSdk = "true";
      script.onerror = () => { window.clearTimeout(timeout); reject(new Error("Meta SDK failed to load")); };
      document.head.appendChild(script);
    }
  });
}

export function EmbeddedSignupButton() {
  const exchange = useServerFn(completeEmbeddedSignup);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useRef<SignupSessionEvent | null>(null);
  const code = useRef<string | null>(null);
  const processing = useRef(false);

  const tryComplete = async () => {
    if (processing.current || !code.current || session.current?.kind !== "finished") return;
    processing.current = true;
    try {
      const event = session.current;
      const result = await exchange({ data: {
        code: code.current,
        wabaId: event.wabaId,
        phoneNumberId: event.phoneNumberId,
      } });
      setStatus(result.detail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Signup verification failed");
    } finally {
      code.current = null;
      processing.current = false;
      setBusy(false);
    }
  };

  // Listener is registered while the component is mounted and removed on unmount.
  const completeRef = useRef(tryComplete);
  completeRef.current = tryComplete;
  useEffect(() => subscribeToEmbeddedSignup((event) => {
    session.current = event;
    if (event.kind === "finished") {
      setStatus("Meta signup completed; verifying the account...");
      void completeRef.current();
    } else {
      setBusy(false);
      setStatus(event.kind === "cancelled" ? "Signup cancelled" : "Meta signup error");
    }
  }), []);

  const start = async () => {
    setStatus("");
    setBusy(true);
    code.current = null;
    session.current = null;
    try {
      const fb = await ensureFacebookSdk();
      fb.login((response) => {
        if (!response.authResponse?.code) {
          setBusy(false);
          setStatus("No authorization code returned by Meta");
          return;
        }
        code.current = response.authResponse.code;
        void completeRef.current();
      }, {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3", version: "v4" },
      });
    } catch (error) {
      setBusy(false);
      setStatus(error instanceof Error ? error.message : "Unable to start signup");
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={busy}
        onClick={() => void start()}>
        {busy ? "Connecting..." : "Connect WhatsApp Business"}
      </Button>
      {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
