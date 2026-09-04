export interface RawStatus {
  id?: string;
  status?: string;
  recipient_id?: string;
}

export class Status {
  public messageId?: string;
  public status?: string;
  public recipientPhoneNumber?: string;

  constructor(rawStatus: RawStatus) {
    this.messageId = rawStatus.id;
    this.status = rawStatus.status;
    this.recipientPhoneNumber = rawStatus.recipient_id;
  }
}

export default Status;
