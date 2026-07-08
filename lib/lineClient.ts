import { messagingApi } from "@line/bot-sdk";

const globalForLine = globalThis as unknown as {
  lineClient: messagingApi.MessagingApiClient | undefined;
};

export const lineClient =
  globalForLine.lineClient ??
  new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  });

if (process.env.NODE_ENV !== "production") {
  globalForLine.lineClient = lineClient;
}
