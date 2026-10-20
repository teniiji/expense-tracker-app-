"use client";

import { useMemo, useState } from "react";
import {
  ColumnMap,
  DEFAULT_OPTIONS,
  Issue,
  ParsedTable,
  checkRows,
  decodeText,
  detectColumns,
  formatSatang,
  parseDelimited,
  parseSatang,
  reconcile,
  sha256Hex,
  sumSatang,
  toRows,
} from "@/lib/transferCheck";

type LoadedFile = {
  name: string;
  sha256: string;
  table: ParsedTable;
  map: ColumnMap;
};

async function loadFile(file: File): Promise<LoadedFile> {
  const buffer = await file.arrayBuffer();
  const table = parseDelimited(decodeText(buffer));
  return {
    name: file.name,
    sha256: await sha256Hex(buffer),
    table,
    map: detectColumns(table.header),
  };
}

const escapeCsvField = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

function downloadReport(issues: Issue[], upload: LoadedFile) {
  const header = ["ระดับ", "รหัส", "บรรทัด", "เลขบัญชี", "รายละเอียด"];
  const rows = issues.map((i) => [
    i.severity === "error" ? "ผิดพลาด" : "เตือน",
    i.code,
    i.line?.toString() ?? "",
    i.accountNo ?? "",
    i.message,
  ]);
  const csv = [
    [`ไฟล์: ${upload.name}`],
    [`SHA-256: ${upload.sha256}`],
    [`ตรวจเมื่อ: ${new Date().toLocaleString("th-TH")}`],
    [],
    header,
    ...rows,
  ]
    .map((row) => row.map((f) => escapeCsvField(String(f))).join(","))
    .join("\n");

  // BOM so Excel opens the Thai text as UTF-8.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ผลตรวจ-${upload.name.replace(/\.[^.]+$/, "")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ColumnSelect({
  label,
  header,
  value,
  optional,
  onChange,
}: {
  label: string;
  header: string[];
  value: number | null;
  optional?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <select
        className="w-full border rounded px-2 py-1 bg-white"
        value={value ?? -1}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(v === -1 ? null : v);
        }}
      >
        <option value={-1}>{optional ? "— ไม่มี —" : "— เลือกคอลัมน์ —"}</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `คอลัมน์ ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilePanel({
  title,
  hint,
  file,
  onFile,
  onMap,
}: {
  title: string;
  hint: string;
  file: LoadedFile | null;
  onFile: (f: File) => void;
  onMap: (map: ColumnMap) => void;
}) {
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <input
        type="file"
        accept=".csv,.txt,.tsv"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        className="text-sm"
      />
      {file && (
        <>
          <p className="text-xs text-slate-500">
            {file.table.rows.length} รายการ · SHA-256{" "}
            <code className="break-all">{file.sha256.slice(0, 16)}…</code>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ColumnSelect
              label="เลขบัญชี"
              header={file.table.header}
              value={file.map.accountNo === -1 ? null : file.map.accountNo}
              onChange={(v) => onMap({ ...file.map, accountNo: v ?? -1 })}
            />
            <ColumnSelect
              label="จำนวนเงิน"
              header={file.table.header}
              value={file.map.amount === -1 ? null : file.map.amount}
              onChange={(v) => onMap({ ...file.map, amount: v ?? -1 })}
            />
            <ColumnSelect
              label="ชื่อบัญชี"
              optional
              header={file.table.header}
              value={file.map.name}
              onChange={(v) => onMap({ ...file.map, name: v })}
            />
            <ColumnSelect
              label="รหัสธนาคาร"
              optional
              header={file.table.header}
              value={file.map.bankCode}
              onChange={(v) => onMap({ ...file.map, bankCode: v })}
            />
          </div>
        </>
      )}
    </div>
  );
}

const isMapped = (f: LoadedFile) => f.map.accountNo !== -1 && f.map.amount !== -1;

export default function TransferChecker() {
  const [upload, setUpload] = useState<LoadedFile | null>(null);
  const [source, setSource] = useState<LoadedFile | null>(null);
  const [controlCount, setControlCount] = useState("");
  const [controlTotal, setControlTotal] = useState("");
  const [highAmount, setHighAmount] = useState("500000");

  const result = useMemo(() => {
    if (!upload || !isMapped(upload)) return null;
    const uploadRows = toRows(upload.table, upload.map);
    const issues = checkRows(uploadRows, {
      ...DEFAULT_OPTIONS,
      highAmountSatang: parseSatang(highAmount) ?? DEFAULT_OPTIONS.highAmountSatang,
      controlCount: controlCount.trim() === "" ? null : Number(controlCount),
      controlTotalSatang: controlTotal.trim() === "" ? null : parseSatang(controlTotal),
    });
    if (source && isMapped(source)) {
      issues.push(...reconcile(uploadRows, toRows(source.table, source.map)));
    }
    issues.sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
        (a.line ?? Infinity) - (b.line ?? Infinity)
    );
    return {
      issues,
      count: uploadRows.length,
      total: sumSatang(uploadRows),
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    };
  }, [upload, source, controlCount, controlTotal, highAmount]);

  const controlTotalInvalid = controlTotal.trim() !== "" && parseSatang(controlTotal) === null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ตรวจไฟล์ก่อนอัปโหลด Corporate Online</h1>
        <p className="text-sm text-slate-600">
          ตรวจเลขบัญชีและยอดเงิน เทียบกับรายการต้นทางของสหกรณ์และยอดควบคุม —
          ประมวลผลในเครื่องนี้ทั้งหมด ไม่มีข้อมูลถูกส่งออกไปที่เซิร์ฟเวอร์
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <FilePanel
          title="1. ไฟล์ที่จะอัปโหลด"
          hint="ไฟล์ที่เตรียมส่งเข้า Corporate Online (CSV / TXT)"
          file={upload}
          onFile={async (f) => setUpload(await loadFile(f))}
          onMap={(map) => upload && setUpload({ ...upload, map })}
        />
        <FilePanel
          title="2. รายการต้นทาง (ไม่บังคับ)"
          hint="รายการจากระบบสหกรณ์ / เอกสารอนุมัติ ใช้เทียบรายบัญชี"
          file={source}
          onFile={async (f) => setSource(await loadFile(f))}
          onMap={(map) => source && setSource({ ...source, map })}
        />
      </div>

      <div className="bg-white rounded-lg border p-4 grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">จำนวนรายการตามเอกสารอนุมัติ</span>
          <input
            inputMode="numeric"
            className="w-full border rounded px-2 py-1"
            value={controlCount}
            onChange={(e) => setControlCount(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">ยอดรวมตามเอกสารอนุมัติ (บาท)</span>
          <input
            inputMode="decimal"
            className={`w-full border rounded px-2 py-1 ${controlTotalInvalid ? "border-red-500" : ""}`}
            value={controlTotal}
            onChange={(e) => setControlTotal(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">เตือนเมื่อยอดต่อรายการตั้งแต่ (บาท)</span>
          <input
            inputMode="decimal"
            className="w-full border rounded px-2 py-1"
            value={highAmount}
            onChange={(e) => setHighAmount(e.target.value)}
          />
        </label>
      </div>

      {upload && !isMapped(upload) && (
        <p className="text-sm text-amber-700">เลือกคอลัมน์เลขบัญชีและจำนวนเงินของไฟล์ที่จะอัปโหลดก่อน</p>
      )}

      {result && upload && (
        <section className="space-y-4">
          <div
            className={`rounded-lg p-4 border ${
              result.errors > 0
                ? "bg-red-50 border-red-300 text-red-800"
                : "bg-green-50 border-green-300 text-green-800"
            }`}
          >
            <p className="text-lg font-semibold">
              {result.errors > 0
                ? `❌ ห้ามอัปโหลด — พบข้อผิดพลาด ${result.errors} รายการ`
                : result.warnings > 0
                  ? `⚠️ ผ่าน แต่มีข้อควรตรวจ ${result.warnings} รายการ`
                  : "✅ ผ่านการตรวจทั้งหมด"}
            </p>
            <p className="text-sm">
              {result.count.toLocaleString("th-TH")} รายการ · ยอดรวม {formatSatang(result.total)} บาท
            </p>
            <p className="text-xs mt-2 break-all">
              SHA-256 ของไฟล์ที่ตรวจ: <code>{upload.sha256}</code>
              <br />
              ตรวจว่าไฟล์ที่เลือกใน Corporate Online เป็นไฟล์เดียวกันนี้ (ห้ามแก้ไขไฟล์หลังตรวจ)
            </p>
          </div>

          {result.issues.length > 0 && (
            <>
              <div className="flex justify-end">
                <button
                  className="text-sm px-3 py-1 rounded border bg-white hover:bg-slate-100"
                  onClick={() => downloadReport(result.issues, upload)}
                >
                  ดาวน์โหลดผลตรวจ (CSV)
                </button>
              </div>
              <div className="bg-white rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left">
                    <tr>
                      <th className="px-3 py-2">ระดับ</th>
                      <th className="px-3 py-2">บรรทัด</th>
                      <th className="px-3 py-2">เลขบัญชี</th>
                      <th className="px-3 py-2">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.issues.map((issue, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {issue.severity === "error" ? "❌ ผิดพลาด" : "⚠️ เตือน"}
                        </td>
                        <td className="px-3 py-2">{issue.line ?? "-"}</td>
                        <td className="px-3 py-2 font-mono">{issue.accountNo ?? "-"}</td>
                        <td className="px-3 py-2">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
