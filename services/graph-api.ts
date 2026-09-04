import * as facebookSdk from "facebook-nodejs-business-sdk";
import config from "./config";

const FacebookAdsApi =
  (facebookSdk as any).FacebookAdsApi || (facebookSdk as any).default?.FacebookAdsApi;
const api = FacebookAdsApi ? new FacebookAdsApi(config.accessToken || "") : null;

export interface ReplyCTA {
  id: string;
  title: string;
}

export interface UtilityTemplateOptions {
  templateName: string;
  locale: string;
  imageLink: string;
}

export interface LimitedTimeOfferOptions {
  templateName: string;
  locale: string;
  imageLink: string;
  offerCode: string;
}

export interface MediaCarouselOptions {
  templateName: string;
  locale: string;
  imageLinks: string[];
}

export class GraphApi {
  private static async makeApiCall(
    messageId: string | undefined,
    senderPhoneNumberId: string,
    requestBody: Record<string, unknown>,
  ): Promise<any> {
    try {
      if (messageId) {
        const typingBody = {
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          typing_indicator: {
            type: "text",
          },
        };

        await api?.call("POST", [`${senderPhoneNumberId}`, "messages"], typingBody);
      }

      const response = await api?.call("POST", [`${senderPhoneNumberId}`, "messages"], requestBody);
      console.log("API call successful:", response);
      return response;
    } catch (error) {
      console.error("Error making API call:", error);
      throw error;
    }
  }

  static async messageWithInteractiveReply(
    messageId: string | undefined,
    senderPhoneNumberId: string,
    recipientPhoneNumber: string | undefined,
    messageText: string,
    replyCTAs: ReplyCTA[],
  ): Promise<any> {
    const requestBody = {
      messaging_product: "whatsapp",
      to: recipientPhoneNumber,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: messageText,
        },
        action: {
          buttons: replyCTAs.map((cta) => ({
            type: "reply",
            reply: {
              id: cta.id,
              title: cta.title,
            },
          })),
        },
      },
    };

    return this.makeApiCall(messageId, senderPhoneNumberId, requestBody);
  }

  static async messageWithUtilityTemplate(
    messageId: string | undefined,
    senderPhoneNumberId: string,
    recipientPhoneNumber: string | undefined,
    options: UtilityTemplateOptions,
  ): Promise<any> {
    const { templateName, locale, imageLink } = options;
    const requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhoneNumber,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: locale,
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: {
                  link: imageLink,
                },
              },
            ],
          },
        ],
      },
    };

    return this.makeApiCall(messageId, senderPhoneNumberId, requestBody);
  }

  static async messageWithLimitedTimeOfferTemplate(
    messageId: string | undefined,
    senderPhoneNumberId: string,
    recipientPhoneNumber: string | undefined,
    options: LimitedTimeOfferOptions,
  ): Promise<any> {
    const { templateName, locale, imageLink, offerCode } = options;

    const currentTime = new Date();
    const futureTime = new Date(currentTime.getTime() + 48 * 60 * 60 * 1000);

    const requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhoneNumber,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: locale,
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: {
                  link: imageLink,
                },
              },
            ],
          },
          {
            type: "limited_time_offer",
            parameters: [
              {
                type: "limited_time_offer",
                limited_time_offer: {
                  expiration_time_ms: futureTime.getTime(),
                },
              },
            ],
          },
          {
            type: "button",
            sub_type: "copy_code",
            index: 0,
            parameters: [
              {
                type: "coupon_code",
                coupon_code: offerCode,
              },
            ],
          },
        ],
      },
    };

    return this.makeApiCall(messageId, senderPhoneNumberId, requestBody);
  }

  static async messageWithMediaCardCarousel(
    messageId: string | undefined,
    senderPhoneNumberId: string,
    recipientPhoneNumber: string | undefined,
    options: MediaCarouselOptions,
  ): Promise<any> {
    const { templateName, locale, imageLinks } = options;
    const requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhoneNumber,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: locale,
        },
        components: [
          {
            type: "carousel",
            cards: imageLinks.map((imageLink, idx) => ({
              card_index: idx,
              components: [
                {
                  type: "header",
                  parameters: [
                    {
                      type: "image",
                      image: {
                        link: imageLink,
                      },
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    };

    return this.makeApiCall(messageId, senderPhoneNumberId, requestBody);
  }
}

export default GraphApi;
