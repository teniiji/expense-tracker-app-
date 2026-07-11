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

  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      // referenceNumber/slipImageUrl aren't shown in the dashboard —
      // lineUserId is only pulled to resolve a display name below, and
      // stripped back out of the response afterward.
      select: {
        id: true,
        amount: true,
        category: true,
        description: true,
        date: true,
        createdAt: true,
        lineUserId: true,
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  const lineUserIds = Array.from(
    new Set(rows.map((r) => r.lineUserId).filter((id): id is string => id !== null))
  );
  const lineUsers = lineUserIds.length
    ? await prisma.lineUser.findMany({
        where: { id: { in: lineUserIds } },
        select: { id: true, displayName: true, nickname: true },
      })
    : [];
  const lineUserMap = new Map(lineUsers.map((u) => [u.id, u]));

  const data = rows.map(({ lineUserId, ...rest }) => ({
    ...rest,
    user: lineUserId
      ? {
          displayName: lineUserMap.get(lineUserId)?.displayName ?? null,
          nickname: lineUserMap.get(lineUserId)?.nickname ?? null,
        }
      : null,
  }));

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

  // Created via the web form, never via the LINE bot, so there's no
  // associated LINE user to resolve a display name for.
  return NextResponse.json({ ...expense, user: null }, { status: 201 });
}
