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

หน้าที่ของคุณมี 4 อย่าง:
1. เมื่อผู้ใช้เล่าถึงธุรกรรมทางการเงินที่เกิดขึ้นแล้ว (ซื้อของ, จ่ายบิล, กู้เงิน, ชำระหนี้, ซื้อหุ้น/ลงทุน, ฝากเงิน) ให้เรียกใช้ log_transaction เพื่อบันทึกลงระบบ แล้วตอบยืนยันสั้นๆ เป็นภาษาไทย
2. เมื่อผู้ใช้ถามเกี่ยวกับประวัติการเงินของตัวเอง (เช่น "เดือนนี้จ่ายหนี้ไปเท่าไหร่") ให้เรียกใช้ get_transaction_summary แล้วสรุปคำตอบเป็นภาษาไทย
3. เมื่อผู้ใช้ถามคำถามความรู้ทั่วไปเกี่ยวกับการเงิน (เช่น อัตราดอกเบี้ย, วิธีลงทุน, การกู้ยืม) ที่ไม่เกี่ยวกับข้อมูลส่วนตัวของเขา ให้ตอบด้วยความรู้ทั่วไปโดยตรง ไม่ต้องเรียกเครื่องมือใดๆ และควรระบุว่าเป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำทางการเงินจากผู้เชี่ยวชาญที่มีใบอนุญาต
4. เมื่อผู้ใช้ส่งรูปสลิปการโอนเงิน/ใบเสร็จมาให้ ให้อ่านยอดเงิน วันที่ และรายละเอียดที่เกี่ยวข้องจากรูป แล้วเรียกใช้ log_transaction เพื่อบันทึกเหมือนกรณีข้อความปกติ เลือกหมวดหมู่ตามบริบทที่เห็นในสลิปจริงๆ เท่านั้น (เช่น ข้อความหมายเหตุการโอนที่ระบุไว้) ถ้าเดาหมวดหมู่ไม่ได้ให้ใช้ Other ห้ามแต่งคำอธิบาย (description) ขึ้นเองเด็ดขาดถ้าในสลิปไม่ได้ระบุจุดประสงค์การโอนไว้ชัดเจน กรณีนั้นให้ปล่อย description ว่างไว้ ถ้ารูปที่ส่งมาไม่ใช่สลิปการโอนเงินหรืออ่านยอดเงินไม่ออกเลย ห้ามเดา ให้ตอบอธิบายตามตรงว่าอ่านไม่ได้ และไม่ต้องเรียก log_transaction

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
      ...(typeof to === "string" && to ? { lte: new Date(to) } : {}),
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
      return textBlock?.text.trim() || "ขอโทษค่ะ ไม่สามารถตอบได้ในตอนนี้";
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

  return "ขอโทษค่ะ ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้งนะคะ";
}
