import { supabase } from "../../integrations/supabase/client";

export interface ImageAnalysis {
  issue_type: "plumbing" | "electrical" | "painting" | "carpentry" | "finishing" | "other";
  urgency: "normal" | "urgent" | "emergency";
  description: string;
  confidence: number;
  possible_causes: string[];
  suggested_action: string;
  detected_objects: string[];
  severity_score: number;
}

export class VisionService {
  async analyzeImage(
    imageFile: File,
    caption?: string,
    conversationId?: string,
    requestId?: string,
  ): Promise<ImageAnalysis> {
    // تحويل الصورة إلى Base64
    const base64 = await this.fileToBase64(imageFile);

    // استدعاء Edge Function
    const { data, error } = await supabase.functions.invoke("ai_image_analyze", {
      body: {
        image_base64: base64,
        caption,
        conversation_id: conversationId,
        request_id: requestId,
      },
    });

    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error);

    return data.data.analysis;
  }

  async analyzeImageFromUrl(
    imageUrl: string,
    caption?: string,
    conversationId?: string,
    requestId?: string,
  ): Promise<ImageAnalysis> {
    const { data, error } = await supabase.functions.invoke("ai_image_analyze", {
      body: {
        image_url: imageUrl,
        caption,
        conversation_id: conversationId,
        request_id: requestId,
      },
    });

    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error);

    return data.data.analysis;
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string)?.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }
}
