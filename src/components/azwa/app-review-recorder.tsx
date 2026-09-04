import { useRef, useState } from "react";
import { Circle, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

type RecorderState = "idle" | "recording" | "stopping";

function safeFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "meta-review";
}

export function AppReviewRecorder({ scenario }: { scenario: string }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);

  const finishStream = () => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError("Screen recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        anchor.href = url;
        anchor.download = `azwa-meta-review-${safeFilePart(scenario)}-${stamp}.webm`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
        chunksRef.current = [];
        finishStream();
        recorderRef.current = null;
        setState("idle");
      };

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      });

      recorder.start(1_000);
      setState("recording");
    } catch (recordingError) {
      finishStream();
      recorderRef.current = null;
      setState("idle");
      setError(recordingError instanceof Error ? recordingError.message : "Unable to start recording");
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setState("stopping");
    recorder.stop();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "idle" ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void start()}>
          <Circle className="mr-2 size-3.5 fill-current" /> Record review video
        </Button>
      ) : (
        <Button type="button" variant="destructive" size="sm" onClick={stop} disabled={state === "stopping"}>
          <Square className="mr-2 size-3.5 fill-current" />
          {state === "stopping" ? "Finishing…" : "Stop & save"}
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {state === "recording" ? "Recording this browser screen…" : "Saved locally as WebM; no video is uploaded by AzWA."}
      </span>
      {error ? <span className="w-full text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
