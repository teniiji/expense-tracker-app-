// Pre-upload checks for a bulk-transfer file bound for the bank's Corporate
// Online system. Everything here is pure and runs in the browser, so member
// account numbers and amounts never leave the officer's machine.
//
// Amounts are handled as integer satang throughout — summing Float baht
// values drifts (0.1 + 0.2 !== 0.3), and a control total that is off by one
// satang is exactly the kind of mismatch this tool exists to catch.

export type Severity = "error" | "warning";

export type Issue = {
  severity: Severity;
  code: string;
  message: string;
  line?: number;
  accountNo?: string;
};

export type ColumnMap = {
  accountNo: number;
  amount: number;
  name: number | null;
  bankCode: number | null;
};

export type TransferRow = {
  line: number;
  rawAccountNo: string;
  accountNo: string;
  name: string;
  bankCode: string;
  rawAmount: string;
  amountSatang: number | null;
};

export type ParsedTable = {
  header: string[];
  rows: string[][];
  // 1-based line number in the original file of each entry in `rows`.
  lines: number[];
};

export type CheckOptions = {
  // Expected account-number length per 3-digit bank code. Banks not listed
  // fall back to `defaultAccountLength`.
  accountLengthByBank: Record<string, number>;
  defaultAccountLength: number;
  // Rows at or above this amount are flagged for a second look.
  highAmountSatang: number;
  controlCount: number | null;
  controlTotalSatang: number | null;
};

export const DEFAULT_OPTIONS: CheckOptions = {
  accountLengthByBank: {
    "030": 12, // ธนาคารออมสิน
    "033": 12, // ธอส.
    "034": 12, // ธ.ก.ส.
  },
  defaultAccountLength: 10,
  highAmountSatang: 50_000_000, // 500,000.00 บาท
  controlCount: null,
  controlTotalSatang: null,
};

// ---------------------------------------------------------------------------
// Reading files

// Bank and legacy cooperative exports are often TIS-620 / Windows-874 rather
// than UTF-8. Decoding Thai TIS-620 bytes as UTF-8 yields U+FFFD, so fall
// back when that shows up.
export function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const text = utf8.includes("�")
    ? new TextDecoder("windows-874").decode(buffer)
    : utf8;
  return text.replace(/^﻿/, "");
}

export function parseDelimited(text: string): ParsedTable {
  const rawLines = text.split(/\r?\n/);
  const firstLine = rawLines.find((l) => l.trim() !== "") ?? "";
  const delimiter = ["\t", "|", ","].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best
  );

  const records: string[][] = [];
  const lines: number[] = [];
  rawLines.forEach((line, i) => {
    if (line.trim() === "") return;
    records.push(splitLine(line, delimiter));
    lines.push(i + 1);
  });

  const [header = [], ...rows] = records;
  return { header: header.map((h) => h.trim()), rows, lines: lines.slice(1) };
}

function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

// Detect columns by header keyword rather than assuming a fixed position —
// cooperative reports and bank templates order their columns differently.
const HEADER_KEYWORDS: Record<keyof ColumnMap, string[]> = {
  accountNo: ["เลขที่บัญชี", "เลขบัญชี", "บัญชี", "account"],
  amount: ["จำนวนเงิน", "ยอดเงิน", "ยอดโอน", "ยอด", "amount"],
  name: ["ชื่อบัญชี", "ชื่อ", "name"],
  bankCode: ["รหัสธนาคาร", "ธนาคาร", "bank"],
};

export function detectColumns(header: string[]): ColumnMap {
  const find = (key: keyof ColumnMap) => {
    const lower = header.map((h) => h.toLowerCase());
    for (const keyword of HEADER_KEYWORDS[key]) {
      const idx = lower.findIndex((h) => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const accountNo = find("accountNo");
  const amount = find("amount");
  const name = find("name");
  const bankCode = find("bankCode");
  return {
    accountNo,
    amount,
    // "ชื่อบัญชี" also contains "บัญชี"; don't let name and account collide.
    name: name === -1 || name === accountNo ? null : name,
    bankCode: bankCode === -1 || bankCode === accountNo ? null : bankCode,
  };
}

export function toRows(table: ParsedTable, map: ColumnMap): TransferRow[] {
  return table.rows.map((cells, i) => {
    const rawAccountNo = cells[map.accountNo] ?? "";
    const rawAmount = cells[map.amount] ?? "";
    return {
      line: table.lines[i],
      rawAccountNo,
      accountNo: rawAccountNo.replace(/[\s-]/g, ""),
      name: map.name === null ? "" : cells[map.name] ?? "",
      bankCode:
        map.bankCode === null ? "" : (cells[map.bankCode] ?? "").padStart(3, "0"),
      rawAmount,
      amountSatang: parseSatang(rawAmount),
    };
  });
}

// "1,234.5" -> 123450. Returns null for anything that isn't a plain number
// with at most two decimals, so the caller can report it instead of guessing.
export function parseSatang(raw: string): number | null {
  const s = raw.replace(/[,\s฿]/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const satang = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -satang : satang;
}

export const formatSatang = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ---------------------------------------------------------------------------
// Checks

export function checkRows(rows: TransferRow[], opts: CheckOptions): Issue[] {
  const issues: Issue[] = [];
  const push = (row: TransferRow, severity: Severity, code: string, message: string) =>
    issues.push({ severity, code, message, line: row.line, accountNo: row.rawAccountNo });

  for (const row of rows) {
    const acct = row.accountNo;
    const expectedLength =
      opts.accountLengthByBank[row.bankCode] ?? opts.defaultAccountLength;

    if (acct === "") {
      push(row, "error", "ACCOUNT_MISSING", "ไม่มีเลขบัญชี");
    } else if (/e\+?\d+$/i.test(acct)) {
      push(row, "error", "ACCOUNT_SCIENTIFIC",
        "เลขบัญชีถูก Excel แปลงเป็นรูปแบบวิทยาศาสตร์ (E+) — ตั้งคอลัมน์เป็น Text แล้ว export ใหม่");
    } else if (!/^\d+$/.test(acct)) {
      push(row, "error", "ACCOUNT_FORMAT", "เลขบัญชีมีอักขระที่ไม่ใช่ตัวเลข");
    } else if (acct.length !== expectedLength) {
      const hint =
        acct.length < expectedLength
          ? " — อาจถูก Excel ตัดเลข 0 นำหน้า"
          : "";
      push(row, "error", "ACCOUNT_LENGTH",
        `เลขบัญชีมี ${acct.length} หลัก (ควรเป็น ${expectedLength} หลัก)${hint}`);
    }

    if (row.amountSatang === null) {
      push(row, "error", "AMOUNT_INVALID",
        `จำนวนเงิน "${row.rawAmount}" ไม่ใช่ตัวเลข หรือมีทศนิยมเกิน 2 ตำแหน่ง`);
    } else if (row.amountSatang <= 0) {
      push(row, "error", "AMOUNT_NONPOSITIVE", "จำนวนเงินต้องมากกว่า 0");
    } else if (row.amountSatang >= opts.highAmountSatang) {
      push(row, "warning", "AMOUNT_HIGH",
        `ยอดสูงผิดปกติ (${formatSatang(row.amountSatang)} บาท) — ตรวจซ้ำกับเอกสารอนุมัติ`);
    }

    if (row.name.trim() === "" && rows.some((r) => r.name.trim() !== "")) {
      push(row, "warning", "NAME_MISSING", "ไม่มีชื่อบัญชี");
    }
  }

  const byAccount = groupByAccount(rows);
  byAccount.forEach((group, acct) => {
    if (acct === "" || group.length < 2) return;
    issues.push({
      severity: "warning",
      code: "DUPLICATE_ACCOUNT",
      message: `เลขบัญชีซ้ำ ${group.length} รายการ (บรรทัด ${group.map((r) => r.line).join(", ")}) — โอนซ้ำหรือไม่?`,
      line: group[0].line,
      accountNo: group[0].rawAccountNo,
    });
  });

  const total = sumSatang(rows);
  if (opts.controlCount !== null && rows.length !== opts.controlCount) {
    issues.push({
      severity: "error",
      code: "CONTROL_COUNT",
      message: `จำนวนรายการในไฟล์ ${rows.length} ไม่ตรงกับยอดควบคุม ${opts.controlCount}`,
    });
  }
  if (opts.controlTotalSatang !== null && total !== opts.controlTotalSatang) {
    issues.push({
      severity: "error",
      code: "CONTROL_TOTAL",
      message: `ยอดรวมในไฟล์ ${formatSatang(total)} ไม่ตรงกับยอดควบคุม ${formatSatang(
        opts.controlTotalSatang
      )} (ต่างกัน ${formatSatang(total - opts.controlTotalSatang)})`,
    });
  }

  return issues;
}

// Compare the file about to be uploaded against the source list exported
// from the cooperative's own system, matched by account number. Duplicate
// accounts are compared on their summed amount so a legitimate split
// payment still reconciles.
export function reconcile(upload: TransferRow[], source: TransferRow[]): Issue[] {
  const issues: Issue[] = [];
  const up = groupByAccount(upload);
  const src = groupByAccount(source);

  up.forEach((rows, acct) => {
    const first = rows[0];
    const match = src.get(acct);
    if (!match) {
      issues.push({
        severity: "error",
        code: "NOT_IN_SOURCE",
        message: "มีในไฟล์อัปโหลด แต่ไม่มีในรายการต้นทางของสหกรณ์",
        line: first.line,
        accountNo: first.rawAccountNo,
      });
      return;
    }
    const upTotal = sumSatang(rows);
    const srcTotal = sumSatang(match);
    if (upTotal !== srcTotal) {
      issues.push({
        severity: "error",
        code: "AMOUNT_MISMATCH",
        message: `ยอดไม่ตรง: ไฟล์อัปโหลด ${formatSatang(upTotal)} / ต้นทาง ${formatSatang(srcTotal)}`,
        line: first.line,
        accountNo: first.rawAccountNo,
      });
    }
    const upName = normalizeName(first.name);
    const srcName = normalizeName(match[0].name);
    if (upName && srcName && upName !== srcName) {
      issues.push({
        severity: "warning",
        code: "NAME_MISMATCH",
        message: `ชื่อไม่ตรง: "${first.name}" / ต้นทาง "${match[0].name}"`,
        line: first.line,
        accountNo: first.rawAccountNo,
      });
    }
  });

  src.forEach((rows, acct) => {
    if (up.has(acct)) return;
    issues.push({
      severity: "error",
      code: "MISSING_FROM_UPLOAD",
      message: `มีในรายการต้นทาง (${rows[0].name || "ไม่มีชื่อ"}, ${formatSatang(
        sumSatang(rows)
      )} บาท) แต่ไม่มีในไฟล์อัปโหลด`,
      accountNo: rows[0].rawAccountNo,
    });
  });

  return issues;
}

const TITLE_PREFIX =
  /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i;

export function normalizeName(name: string): string {
  return name.trim().replace(TITLE_PREFIX, "").replace(/\s+/g, " ").toLowerCase();
}

function groupByAccount(rows: TransferRow[]): Map<string, TransferRow[]> {
  const map = new Map<string, TransferRow[]>();
  for (const row of rows) {
    const group = map.get(row.accountNo);
    if (group) group.push(row);
    else map.set(row.accountNo, [row]);
  }
  return map;
}

export const sumSatang = (rows: TransferRow[]) =>
  rows.reduce((sum, r) => sum + (r.amountSatang ?? 0), 0);

// Fingerprint of the exact bytes that were checked. The checker compares it
// with the file actually chosen in Corporate Online, so an edit made after
// the check (even one character) can't slip through unnoticed.
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
