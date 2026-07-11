import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/categories";
import { buildExpenseWhere } from "@/lib/expenseFilters";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const where = buildExpenseWhere(searchParams);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE)
  );

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      // The dashboard only ever reads these fields (see lib/types.ts) — no
      // need to pull lineUserId/referenceNumber/slipImageUrl over the wire.
      select: {
        id: true,
        amount: true,
        category: true,
        description: true,
        date: true,
        createdAt: true,
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { amount, category, description, date } = body;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be a positive number" },
      { status: 400 }
    );
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!date || isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const expense = await prisma.expense.create({
    data: {
      amount,
      category,
      description: typeof description === "string" ? description : null,
      date: new Date(date),
    },
    select: {
      id: true,
      amount: true,
      category: true,
      description: true,
      date: true,
      createdAt: true,
    },
  });

  return NextResponse.json(expense, { status: 201 });
}
