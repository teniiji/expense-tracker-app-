import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./anthropicClient";
import { prisma } from "./prisma";
import { CATEGORIES } from "./categories";
import { formatAmount } from "./format";

const MODEL = "claude-haiku-4-5";
const MAX_TOOL_TURNS = 3;

const tools: Anthropic.Tool[] = [
  {
    name: "log_transaction",
    description:
      "Record a completed money transaction the user described: a purchase/expense, a bill payment, a loan taken out, a debt repayment, a stock/investment purchase, or a bank deposit/savings. Call this only when the user is reporting something that already happened and gave a clear amount.",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Transaction amount in Thai baht. Always positive.",
        },
        category: {
          type: "string",
          enum: [...CATEGORIES],
          description: "Best-fitting category for this transaction.",
        },
        description: {
          type: "string",
          description:
            "Short free-text note, e.g. merchant or purpose. Only include what the user actually stated or what's explicitly written on a slip/receipt image — never invent one. Omit this field entirely if no purpose is stated.",
        },
        date: {
          type: "string",
          description:
            "ISO 8601 date (YYYY-MM-DD) the transaction happened on. Omit to use today.",
        },
      },
      required: ["amount", "category"],
    },
  },
  {
    name: "get_transaction_summary",
    description:
      "Look up totals from the user's own previously recorded transactions, optionally filtered by date range and/or category. Use this when the user asks about their own spending, debt, or savings history.",
    input_schema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "ISO 8601 start date (YYYY-MM-DD), inclusive.",
        },
        to: {
          type: "string",
          description: "ISO 8601 end date (YYYY-MM-DD), inclusive.",
        },
        category: {
          type: "string",
          enum: [...CATEGORIES],
        },
      },
    },
  },
];

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `คุณคือผู้ช่วยด้านการเงินส่วนตัวที่ทำงานผ่าน LINE ให้กับแอปบันทึกรายจ่าย (expense tracker) วันนี้คือวันที่ ${today}

หมวดหมู่ที่ใช้ในระบบมีเฉพาะ: ${CATEGORIES.join(", ")}

ข้อจำกัดสำคัญที่ต้องรู้: แต่ละข้อความที่ผู้ใช้ส่งเข้ามาถูกประมวลผลแยกจากกันโดยสิ้นเชิง คุณ**ไม่มีความจำ**ข้อความหรือรูปก่อนหน้าเลย ดังนั้น**ห้ามถามคำถามกลับเพื่อขอข้อมูลเพิ่มเติมก่อนบันทึกเด็ดขาด** (เช่น ห้ามถามว่า "เป็นรายการอะไร" หรือ "หมวดหมู่ไหน") เพราะคุณจะไม่เห็นคำตอบที่ผู้ใช้ตอบกลับมาเชื่อมกับข้อมูลเดิม ทุกครั้งที่มีจำนวนเงินและหลักฐานว่าธุรกรรมเกิดขึ้นแล้ว ให้ตัดสินใจเลือกหมวดหมู่ที่ใกล้เคียงที่สุดเอง (ใช้ Other ถ้าเดาไม่ได้จริงๆ) แล้วเรียก log_transaction บันทึกให้เสร็จภายในข้อความเดียวเสมอ ไม่ต้องรอถามก่อน

หน้าที่ของคุณมี 4 อย่าง:
1. เมื่อผู้ใช้เล่าถึงธุรกรรมทางการเงินที่เกิดขึ้นแล้ว (ซื้อของ, จ่ายบิล, กู้เงิน, ชำระหนี้, ซื้อหุ้น/ลงทุน, ฝากเงิน) ให้เรียกใช้ log_transaction เพื่อบันทึกลงระบบทันที แล้วตอบยืนยันสั้นๆ เป็นภาษาไทย
2. เมื่อผู้ใช้ถามเกี่ยวกับประวัติการเงินของตัวเอง (เช่น "เดือนนี้จ่ายหนี้ไปเท่าไหร่") ให้เรียกใช้ get_transaction_summary แล้วสรุปคำตอบเป็นภาษาไทย
3. เมื่อผู้ใช้ถามคำถามความรู้ทั่วไปเกี่ยวกับการเงิน (เช่น อัตราดอกเบี้ย, วิธีลงทุน, การกู้ยืม) ที่ไม่เกี่ยวกับข้อมูลส่วนตัวของเขา ให้ตอบด้วยความรู้ทั่วไปโดยตรง ไม่ต้องเรียกเครื่องมือใดๆ และควรระบุว่าเป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำทางการเงินจากผู้เชี่ยวชาญที่มีใบอนุญาต
4. เมื่อผู้ใช้ส่งรูปสลิปการโอนเงิน/จ่ายบิล/ใบเสร็จมาให้ ให้อ่านยอดเงิน วันที่ และรายละเอียดที่เกี่ยวข้องจากรูป แล้วเรียกใช้ log_transaction เพื่อบันทึกทันทีในข้อความเดียวเหมือนกรณีข้อความปกติ (ห้ามถามหมวดหมู่กลับตามข้อจำกัดด้านบน) แอปธนาคาร/กระเป๋าเงินดิจิทัลของไทยทุกเจ้า ไม่ว่าจะเป็นธนาคารใด หรือแอปอย่างเป๋าตังก์ (Paotang), ทรูมันนี่, LINE Pay ฯลฯ (ไม่ใช่แค่รายชื่อตัวอย่างเช่น K PLUS, SCB Easy, Krungthai NEXT, Bualuang mBanking, ttb touch, MyMo, Krungsri App) มีสลิปหน้าตาและถ้อยคำไม่เหมือนกัน และมีธุรกรรมได้หลายแบบ เช่น โอนเงิน (ภายใน/ข้ามธนาคาร/พร้อมเพย์), จ่ายบิล, เติมเงิน, ชำระค่าสินค้า ฯลฯ **อย่ายึดติดกับถ้อยคำหรือหน้าตาสลิปแบบใดแบบหนึ่ง** ให้จับหลักการทั่วไปแทน: ถ้าเห็นคำหรือวลีที่สื่อว่าธุรกรรมทำสำเร็จแล้ว (คำภาษาไทยที่ลงท้ายด้วย "สำเร็จ" เช่น "โอนเงินสำเร็จ", "จ่ายบิลสำเร็จ", "ชำระเงินสำเร็จ", "เติมเงินสำเร็จ", "รายการสำเร็จ" หรือความหมายใกล้เคียง) ร่วมกับเครื่องหมายถูก/จำนวนเงิน/เลขที่รายการ ให้ถือว่าเป็นหลักฐานการชำระเงินที่ถูกต้องเสมอ ไม่ว่าจะเป็นธนาคารไหน ประเภทธุรกรรมอะไร หรือพื้นหลัง/ธีมตกแต่งเป็นแบบใดก็ตาม ห้ามใช้ภาพพื้นหลังหรือโลโก้มาตัดสินว่าเป็นตั๋ว/ใบสมัครสมาชิก/เอกสารอื่นเด็ดขาด ให้ดูเฉพาะข้อความและตัวเลขที่เป็นเนื้อหาจริงเท่านั้น เลือกหมวดหมู่ตามบริบทที่เห็นในสลิปจริงๆ ถ้ามีระบุไว้ (เช่น ข้อความหมายเหตุการโอน, ชื่อบิลที่จ่าย) ถ้าสลิปไม่ได้ระบุจุดประสงค์ไว้ ให้ใช้ Other เป็นหมวดหมู่ทันที ห้ามถามกลับ ห้ามแต่งคำอธิบาย (description) ขึ้นเองเด็ดขาดถ้าในสลิปไม่ได้ระบุจุดประสงค์ไว้ชัดเจน กรณีนั้นให้ปล่อย description ว่างไว้ ปฏิเสธการบันทึกเฉพาะกรณีที่ข้อความในสลิปเองชัดเจนว่ายังไม่สำเร็จ/ยังไม่ได้ชำระ หรืออ่านจำนวนเงินไม่ออกจริงๆ เท่านั้น

ตอบสั้น กระชับ เป็นกันเอง และเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้พิมพ์มาเป็นภาษาอื่น`;
}

type LogTransactionInput = {
  amount?: unknown;
  category?: unknown;
  description?: unknown;
  date?: unknown;
};

async function logTransaction(
  input: LogTransactionInput,
  lineUserId: string
): Promise<string> {
  const { amount, category, description, date } = input;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return "Error: amount must be a positive number.";
  }
  if (
    typeof category !== "string" ||
    !CATEGORIES.includes(category as (typeof CATEGORIES)[number])
  ) {
    return `Error: category must be one of ${CATEGORIES.join(", ")}.`;
  }
  const parsedDate = typeof date === "string" && date ? new Date(date) : new Date();
  if (Number.isNaN(parsedDate.getTime())) {
    return "Error: invalid date.";
  }

  const expense = await prisma.expense.create({
    data: {
      amount,
      category,
      description: typeof description === "string" ? description : null,
      date: parsedDate,
      lineUserId,
    },
  });

  return `Logged: ${formatAmount(expense.amount)} (${expense.category}) on ${expense.date
    .toISOString()
    .slice(0, 10)}.`;
}

type SummaryInput = {
  from?: unknown;
  to?: unknown;
  category?: unknown;
};

async function getTransactionSummary(
  input: SummaryInput,
  lineUserId: string
): Promise<string> {
  const { from, to, category } = input;

  const where: Record<string, unknown> = { lineUserId };

  if (typeof category === "string" && category) {
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return `Error: category must be one of ${CATEGORIES.join(", ")}.`;
    }
    where.category = category;
  }

  if (typeof from === "string" || typeof to === "string") {
    where.date = {
      ...(typeof from === "string" && from ? { gte: new Date(from) } : {}),
      // `to` is a date-only string (e.g. "2026-07-09"), which parses to
      // UTC midnight. Use an exclusive upper bound one day later so the
      // whole day is included instead of only timestamps at/before 00:00.
      ...(typeof to === "string" && to
        ? { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) }
        : {}),
    };
  }

  const grouped = await prisma.expense.groupBy({
    by: ["category"],
    where,
    _sum: { amount: true },
    _count: true,
  });

  if (grouped.length === 0) {
    return "No matching transactions found for this user in the given range.";
  }

  const total = grouped.reduce((sum, g) => sum + (g._sum.amount ?? 0), 0);
  const breakdown = grouped
    .map(
      (g) =>
        `${g.category}: ${formatAmount(g._sum.amount ?? 0)} (${g._count} records)`
    )
    .join("; ");

  return `Total: ${formatAmount(total)}. Breakdown: ${breakdown}.`;
}

async function executeTool(
  name: string,
  input: unknown,
  lineUserId: string
): Promise<string> {
  try {
    if (name === "log_transaction") {
      return await logTransaction(input as LogTransactionInput, lineUserId);
    }
    if (name === "get_transaction_summary") {
      return await getTransactionSummary(input as SummaryInput, lineUserId);
    }
    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Error executing ${name}: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}

export async function runFinanceAgent(
  userContent: Anthropic.MessageParam["content"],
  lineUserId: string
): Promise<string> {
  const system = buildSystemPrompt();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      const text = textBlock?.text.trim();
      if (!text) {
        console.error(
          "[financeAgent] empty model response, falling back:",
          JSON.stringify({
            stopReason: response.stop_reason,
            contentTypes: response.content.map((b) => b.type),
          })
        );
      }
      return text || "ขอโทษค่ะ ไม่สามารถตอบได้ในตอนนี้";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input, lineUserId);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // The loop above may have already committed a tool's side effect (e.g.
  // logged an expense) on its final turn without getting a chance to reply.
  // Make one more call with tools disabled so the model must summarize what
  // actually happened instead of the caller returning a generic "failed"
  // message for work that already succeeded.
  const finalResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages,
  });
  const finalText = finalResponse.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  return finalText?.text.trim() || "ขอโทษค่ะ ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้งนะคะ";
}
