export interface RawMessage {
  id?: string;
  type?: string;
  from?: string;
  interactive?: {
    button_reply?: {
      id?: string;
      title?: string;
    };
  };
}

export class Message {
  public id?: string;
  public type: string;
  public senderPhoneNumber?: string;

  constructor(rawMessage: RawMessage) {
    this.id = rawMessage.id;

    if (rawMessage.type === "interactive" && rawMessage.interactive?.button_reply?.id) {
      this.type = rawMessage.interactive.button_reply.id;
    } else {
      this.type = "unknown";
    }

    this.senderPhoneNumber = rawMessage.from;
  }
}

export default Message;
