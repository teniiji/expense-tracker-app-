import { NextRequest, NextResponse } from "next/server";
import { validateSignature, webhook } from "@line/bot-sdk";
import type Anthropic from "@anthropic-ai/sdk";
import { lineClient, lineBlobClient } from "@/lib/lineClient";
import { runFinanceAgent } from "@/lib/financeAgent";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

async function streamToBase64(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("base64");
}

async function buildUserContent(
  message: webhook.MessageContent
): Promise<Anthropic.MessageParam["content"]> {
  if (message.type === "text") {
    return (message as webhook.TextMessageContent).text;
  }

  const image = message as webhook.ImageMessageContent;
  const stream = await lineBlobClient.getMessageContent(image.id);
  const base64 = await streamToBase64(stream);
  return [
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: base64 },
    },
    {
      type: "text",
      text: "นี่คือรูปที่ผู้ใช้ส่งมา ถ้าเป็นสลิปการโอนเงินให้อ่านยอดเงินและบันทึกเป็นรายการ",
    },
  ];
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (
    event.type !== "message" ||
    (event.message.type !== "text" && event.message.type !== "image") ||
    !event.replyToken ||
    event.source?.type !== "user" ||
    !event.source.userId
  ) {
    return;
  }

  // LINE retries webhook deliveries that don't get a timely 200 (e.g. a
  // slow slip-image request that runs close to maxDuration). Record the
  // event ID first so a retried delivery for the same event is a no-op
  // instead of re-running the agent and creating a duplicate expense.
  try {
    await prisma.processedLineEvent.create({
      data: { eventId: event.webhookEventId },
    });
  } catch {
    return;
  }

  const lineUserId = event.source.userId;

  let replyText: string;
  try {
    const userContent = await buildUserContent(event.message);
    replyText = await runFinanceAgent(userContent, lineUserId);
  } catch (err) {
    console.error("[line/webhook] finance agent error:", err);
    replyText = "ขอโทษค่ะ เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะคะ";
  }

  try {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: replyText }],
    });
  } catch (err) {
    console.error("[line/webhook] LINE reply error:", err);
  }
}

export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  const signature = request.headers.get("x-line-signature") ?? "";
  const rawBody = await request.text();

  if (!channelSecret || !validateSignature(rawBody, channelSecret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: webhook.CallbackRequest;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = body.events ?? [];

  // Process events but never let a single failure block the 200 response —
  // LINE retries the whole webhook delivery on a non-2xx, which would
  // re-trigger already-handled messages.
  await Promise.all(
    events.map((event) =>
      handleEvent(event).catch((err) =>
        console.error("[line/webhook] unhandled event error:", err)
      )
    )
  );

  return NextResponse.json({ status: "ok" });
}
