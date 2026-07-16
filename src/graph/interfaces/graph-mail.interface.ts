export interface GraphEmailAddress {
  address: string;
}

export interface GraphRecipient {
  emailAddress: GraphEmailAddress;
}

export interface GraphSendMailPayload {
  message: {
    subject: string;
    body: {
      contentType: "HTML" | "Text";
      content: string;
    };
    toRecipients: GraphRecipient[];
    ccRecipients?: GraphRecipient[];
    bccRecipients?: GraphRecipient[];
  };
  saveToSentItems: boolean;
}