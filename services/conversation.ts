import constants from "./constants";
import GraphApi from "./graph-api";
import Message, { type RawMessage } from "./message";
import Status, { type RawStatus } from "./status";
import Cache from "./redis";

function sendTryOutDemoMessage(
  messageId: string | undefined,
  senderPhoneNumberId: string,
  recipientPhoneNumber: string | undefined,
  messageBody: string,
): Promise<any> {
  return GraphApi.messageWithInteractiveReply(
    messageId,
    senderPhoneNumberId,
    recipientPhoneNumber,
    messageBody,
    [
      {
        id: constants.REPLY_INTERACTIVE_MEDIA_ID,
        title: constants.REPLY_INTERACTIVE_WITH_MEDIA_CTA,
      },
      {
        id: constants.REPLY_MEDIA_CAROUSEL_ID,
        title: constants.REPLY_MEDIA_CARD_CAROUSEL_CTA,
      },
      {
        id: constants.REPLY_OFFER_ID,
        title: constants.REPLY_OFFER_CTA,
      },
    ],
  );
}

function sendInteractiveMediaMessage(
  messageId: string | undefined,
  senderPhoneNumberId: string,
  recipientPhoneNumber: string | undefined,
): Promise<any> {
  return GraphApi.messageWithUtilityTemplate(messageId, senderPhoneNumberId, recipientPhoneNumber, {
    templateName: "grocery_delivery_utility",
    locale: "en_US",
    imageLink:
      "https://scontent.xx.fbcdn.net/mci_ab/uap/asset_manager/id/?ab_b=e&ab_page=AssetManagerID&ab_entry=1530053877871776",
  });
}

function sendLimitedTimeOfferMessage(
  messageId: string | undefined,
  senderPhoneNumberId: string,
  recipientPhoneNumber: string | undefined,
): Promise<any> {
  return GraphApi.messageWithLimitedTimeOfferTemplate(
    messageId,
    senderPhoneNumberId,
    recipientPhoneNumber,
    {
      templateName: "strawberries_limited_offer",
      locale: "en_US",
      imageLink:
        "https://scontent.xx.fbcdn.net/mci_ab/uap/asset_manager/id/?ab_b=e&ab_page=AssetManagerID&ab_entry=1393969325614091",
      offerCode: "BERRIES20",
    },
  );
}

function sendMediaCarouselMessage(
  messageId: string | undefined,
  senderPhoneNumberId: string,
  recipientPhoneNumber: string | undefined,
): Promise<any> {
  return GraphApi.messageWithMediaCardCarousel(
    messageId,
    senderPhoneNumberId,
    recipientPhoneNumber,
    {
      templateName: "recipe_media_carousel",
      locale: "en_US",
      imageLinks: [
        "https://scontent.xx.fbcdn.net/mci_ab/uap/asset_manager/id/?ab_b=e&ab_page=AssetManagerID&ab_entry=1389202275965231",
        "https://scontent.xx.fbcdn.net/mci_ab/uap/asset_manager/id/?ab_b=e&ab_page=AssetManagerID&ab_entry=3255815791260974",
      ],
    },
  );
}

async function markMessageForFollowUp(messageId: string): Promise<void> {
  await Cache.insert(messageId);
}

export class Conversation {
  public phoneNumberId: string;

  constructor(phoneNumberId: string) {
    this.phoneNumberId = phoneNumberId;
  }

  static async handleMessage(senderPhoneNumberId: string, rawMessage: RawMessage): Promise<void> {
    const message = new Message(rawMessage);

    switch (message.type) {
      case constants.REPLY_INTERACTIVE_MEDIA_ID: {
        const interactiveMediaResponse = await sendInteractiveMediaMessage(
          message.id,
          senderPhoneNumberId,
          message.senderPhoneNumber,
        );
        if (interactiveMediaResponse?.messages?.[0]?.id) {
          await markMessageForFollowUp(interactiveMediaResponse.messages[0].id);
        }
        break;
      }
      case constants.REPLY_MEDIA_CAROUSEL_ID: {
        const mediaCarouselResponse = await sendMediaCarouselMessage(
          message.id,
          senderPhoneNumberId,
          message.senderPhoneNumber,
        );
        if (mediaCarouselResponse?.messages?.[0]?.id) {
          await markMessageForFollowUp(mediaCarouselResponse.messages[0].id);
        }
        break;
      }
      case constants.REPLY_OFFER_ID: {
        const ltoResponse = await sendLimitedTimeOfferMessage(
          message.id,
          senderPhoneNumberId,
          message.senderPhoneNumber,
        );
        if (ltoResponse?.messages?.[0]?.id) {
          await markMessageForFollowUp(ltoResponse.messages[0].id);
        }
        break;
      }
      default:
        await sendTryOutDemoMessage(
          message.id,
          senderPhoneNumberId,
          message.senderPhoneNumber,
          constants.APP_DEFAULT_MESSAGE,
        );
        break;
    }
  }

  static async handleStatus(senderPhoneNumberId: string, rawStatus: RawStatus): Promise<void> {
    const status = new Status(rawStatus);

    if (!(status.status === "delivered" || status.status === "read")) {
      return;
    }

    if (status.messageId && (await Cache.remove(status.messageId))) {
      await sendTryOutDemoMessage(
        undefined,
        senderPhoneNumberId,
        status.recipientPhoneNumber,
        constants.APP_TRY_ANOTHER_MESSAGE,
      );
    }
  }
}

export default Conversation;
