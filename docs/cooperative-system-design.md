# การออกแบบระบบรวม — งานบริการจัดการสหกรณ์ออมทรัพย์ครูหนองคาย จำกัด

เอกสารนี้สรุปการตรวจสอบ (review) ระบบและ workflow ทั้งหมดที่เคยสร้างไว้ในทั้ง 3 repository
และเสนอแนวทางนำส่วนประกอบเหล่านั้นมาประยุกต์ใช้ร่วมกันอย่างมีประสิทธิภาพ
ภายใต้บริบทงานบริการสมาชิกของสหกรณ์ออมทรัพย์ครูหนองคาย จำกัด (NKTSC)

จัดทำ: 2026-07-16

---

## 1. ระบบที่มีอยู่ทั้งหมด (Inventory)

### 1.1 `teniiji/expense-tracker-app-` — ระบบบันทึกรายจ่ายส่วนบุคคล (ต้นแบบ)

Stack: Next.js 14 (App Router) + TypeScript + Prisma/PostgreSQL + Tailwind + Recharts + Vercel

| ส่วนประกอบ | หน้าที่ |
| --- | --- |
| `app/api/line/webhook/route.ts` | LINE webhook: ตรวจ signature, กันเหตุการณ์ซ้ำ (`ProcessedLineEvent`), เรียก agent, ตอบกลับ |
| `lib/financeAgent.ts` | Claude tool-use agent 5 เครื่องมือ: `log_transaction`, `hold_transaction_for_purpose`, `decline_unreadable_image`, `get_transaction_summary`, `set_nickname` |
| `app/page.tsx` + `components/*` | **แดชบอร์ดเว็บ**: SummaryCards, CategoryChart, TrendChart, ExpenseList (แบ่งหน้า server-side), ExpenseFilters, ExpenseForm, LineUsersPanel |
| `app/api/expenses/*` | REST API: list/create/edit/delete + summary + แปลง lineUserId → ชื่อสมาชิก |
| `lib/csv.ts` | ส่งออกข้อมูลเป็น CSV |
| `prisma/schema.prisma` | `Expense`, `ProcessedLineEvent`, `PendingTransaction`, `LineUser` |

จุดเด่นเชิงวิศวกรรมที่พิสูจน์แล้วใน repo นี้:
- **Idempotency**: กัน LINE ส่ง webhook ซ้ำด้วย unique constraint บน `eventId`
- **กันสลิปซ้ำ**: unique constraint บน `referenceNumber`
- **สถานะข้ามข้อความ (stateless webhook)**: `PendingTransaction` ถือยอดเงินรอผู้ใช้ตอบจุดประสงค์ พร้อม expiry 15 นาที และ claim-then-delete กันอ่านซ้ำ
- **ประสิทธิภาพ**: อัปโหลด Blob ควบคู่กับการเรียก Claude vision (ไม่บล็อกกัน), composite index `(lineUserId, date)`, เลือกเฉพาะคอลัมน์ที่ใช้
- **ความทนทานของ agent loop**: บังคับ tool call เมื่อเป็นรูปภาพ (`tool_choice`), บังคับ `log_transaction` เมื่อ resume pending hold, มี final call แบบปิด tools เพื่อสรุปผลเสมอ
- **เลือกโมเดลตามงาน**: Haiku 4.5 สำหรับข้อความ (เร็ว/ถูก), Sonnet 5 สำหรับอ่านสลิป (แม่นกว่า)

### 1.2 `teniiji/Line-Bot-Nktsc` — LINE OA สหกรณ์ครูหนองคาย (ระบบงานจริง)

ต่อยอดจาก expense-tracker โดยตรง และขยายเป็นระบบบริการสมาชิกสหกรณ์เต็มรูปแบบ:

| ความสามารถ | รายละเอียด |
| --- | --- |
| **Agent 9 เครื่องมือ** | `report_transaction`, `submit_member_info`, `submit_contact_phone`, `submit_loan_type`, `decline_unreadable_image`, `flag_supporting_document`, `submit_service_purpose`, `get_transaction_summary`, `set_nickname` |
| **ยืนยันตัวตนสมาชิก** | เก็บชื่อ-เลขสมาชิกครั้งเดียว (`LineUser.fullName/memberNumber`) ตรวจกับ `MemberRoster` ที่นำเข้าจากสเปรดชีต — บันทึกธง `memberVerified` ต่อรายการ |
| **ตรวจสลิปเข้มขึ้น** | ยอดต้องตรง + บัญชีปลายทางต้องเป็นสหกรณ์ + กันซ้ำ 2 ชั้น (SHA-256 ของรูป เป็นหลัก, referenceNumber เป็นรอง) |
| **ส่งต่องานถึงเจ้าหน้าที่** | เอกสารประกอบ (สลิปเงินเดือน/สำเนาบัตร/ทะเบียนบ้าน ฯลฯ) → ถามจุดประสงค์ → route ตามแผนก: สินเชื่อ → `LoanDistrictContact` รายหน่วยงาน (fallback `LINE_FORWARD_LOAN_ID`), อื่นๆ → `LINE_FORWARD_GENERAL_ID` — และไม่โกหกผู้ใช้ถ้าส่งต่อไม่ได้ |
| **ฐานข้อมูลอ้างอิงองค์กร** | `OrganizationUnit` (หน่วยงาน/ผู้รับรายการหักรายเดือน), `MemberRoster`, `LoanDistrictContact` + สคริปต์นำเข้า `import-org-data.ts`, `import-loan-contacts.ts` |
| **ฐานความรู้ static** | อัตราดอกเบี้ยเงินฝาก/เงินกู้ สวัสดิการ ข้อมูลติดต่อ แบบฟอร์ม ฝังใน system prompt — ตัดสินใจปิด `web_search`/`web_fetch` โดยเจตนา (เคยเจอลิงก์ไม่พึงประสงค์ปนมา) และมีตัวกรอง `stripDisallowedLinks` อนุญาตเฉพาะโดเมน `nktscoop.com` เป็นชั้นป้องกันที่สอง |
| **สถานะหลายขั้นข้ามข้อความ** | `PendingTransaction` ขยายเป็น checklist (ตัวตน + สลิป + ประเภทเงินกู้สำหรับชำระหนี้), `PendingServiceRequest` สำหรับ flow เอกสารประกอบ |

### 1.3 `teniiji/teniiji` — โปรไฟล์ GitHub

มีเพียง README โปรไฟล์ ไม่มีโค้ดระบบ (ไม่มีผลต่อการออกแบบ)

---

## 2. ผลการตรวจสอบ (Review)

### สิ่งที่ทำได้ดีแล้ว
1. สถาปัตยกรรม serverless + stateless webhook ที่จัดการ retry/duplicate ได้ครบทุกชั้น (event, slip hash, reference number)
2. การออกแบบ tool ให้ "จบใน 1 ข้อความ" ลดการถามกลับ เหมาะกับพฤติกรรมผู้ใช้ LINE
3. การแยกข้อมูลอ้างอิงองค์กรออกจากข้อมูลที่ผู้ใช้พิมพ์เอง (`MemberRoster` vs `LineUser`) และแยกผู้รับผิดชอบรายการหักออกจากผู้รับผิดชอบสินเชื่อ (`OrganizationUnit` vs `LoanDistrictContact`) — ตรงกับโครงสร้างงานจริงของสหกรณ์
4. วินัยด้านความปลอดภัยข้อมูล: ไม่ commit สเปรดชีตสมาชิก, ปิด log user ID หลังใช้งาน, กรองลิงก์ทุกคำตอบ

### ช่องว่างสำคัญ (Gap) ของระบบสหกรณ์ปัจจุบัน
1. **ไม่มีแดชบอร์ดสำหรับเจ้าหน้าที่** — `line-bot-nktsc` ตัด UI ออกเหลือแต่ API (`app/` มีเฉพาะ `api/`) ทั้งที่ต้นแบบ expense-tracker มีแดชบอร์ดครบ (กราฟ, ตัวกรอง, แบ่งหน้า, แก้ไขรายการ, CSV)
2. **รายการที่ `memberVerified = false` ไม่มีคิวให้เจ้าหน้าที่ตรวจ** — ธงถูกบันทึกแล้วแต่ไม่มีหน้าจอทำงาน
3. **ฐานความรู้แก้ได้เฉพาะใน code** — เปลี่ยนอัตราดอกเบี้ยต้อง commit + deploy ใหม่ทุกครั้ง
4. **การส่งต่อถึงเจ้าหน้าที่ไม่มี audit trail ในฐานข้อมูล** — `PendingServiceRequest` ถูกลบหลัง forward สำเร็จ ไม่เหลือประวัติว่าเรื่องไหนส่งถึงใคร เมื่อไร ปิดงานหรือยัง
5. ยังไม่มี test อัตโนมัติในทั้งสอง repo (ตรวจได้แค่ `tsc --noEmit` + `next build`)

---

## 3. ส่วนประกอบที่นำมาประยุกต์ใช้ร่วมกันได้ (Reuse Map)

องค์ประกอบทั้งสอง repo ใช้ schema/stack เดียวกัน จึงย้ายข้ามกันได้ตรงๆ โดยแทบไม่ต้องดัดแปลง:

| จาก expense-tracker | นำไปใช้ใน line-bot-nktsc เป็น | งานที่ต้องปรับ |
| --- | --- | --- |
| `components/Dashboard.tsx`, `SummaryCards`, `CategoryChart`, `TrendChart` | **แดชบอร์ดเจ้าหน้าที่สหกรณ์**: ยอดรับชำระรายวัน/เดือน แยกหมวด (ชำระหนี้/ฝากเงิน/ซื้อหุ้น) | เปลี่ยนป้ายหมวดหมู่เป็นหมวดของสหกรณ์, เพิ่มคอลัมน์ `memberFullName/memberNumber/memberVerified/loanType` |
| `components/ExpenseList` + `ExpenseFilters` + pagination ใน `app/api/expenses` | ตารางธุรกรรมสมาชิก ค้นหา/กรองตามช่วงวันที่ หมวด และสถานะยืนยันตัวตน | เพิ่ม filter `memberVerified=false` → กลายเป็น **คิวตรวจสอบรายการที่ยังไม่ยืนยัน** (แก้ gap ข้อ 2) |
| `components/LineUsersPanel` + `app/api/line-users` | หน้าจัดการสมาชิกที่ทักบอท (มี API อยู่แล้วใน nktsc ขาดแต่ UI) | ผูกเพิ่มกับ `MemberRoster` เพื่อแสดงหน่วยงานสังกัด |
| `lib/csv.ts` | ส่งออกรายการรับชำระประจำวัน/เดือนให้ฝ่ายบัญชี | เพิ่มคอลัมน์เลขสมาชิก/ประเภทเงินกู้ |
| `components/ConfirmDialog`, `ExpenseForm` | แก้ไข/ยกเลิกรายการที่บันทึกผิดโดยเจ้าหน้าที่ | จำกัดสิทธิ์ (ต้องมี auth ก่อน — ดูข้อ 4.3) |

| จาก line-bot-nktsc | ควรย้อนกลับไปใช้ใน expense-tracker (ถ้ายังพัฒนาต่อ) |
| --- | --- |
| `slipImageHash` (SHA-256) | กันสลิปซ้ำที่แม่นกว่า referenceNumber |
| `stripDisallowedLinks` | กรองลิงก์ทุกคำตอบก่อนส่งเข้า LINE |
| โครง `PendingTransaction` แบบ checklist | รองรับ flow เก็บข้อมูลหลายขั้น |

---

## 4. สถาปัตยกรรมรวมที่เสนอ

```
สมาชิก (LINE) ──► LINE OA webhook ──► financeAgent (Claude tool-use)
                                        │  ├─ บันทึกธุรกรรม + ตรวจสลิป + ยืนยันตัวตน
                                        │  └─ ส่งต่อคำขอบริการ → เจ้าหน้าที่ (LINE push)
                                        ▼
                                   PostgreSQL (Prisma)
                                        ▲
เจ้าหน้าที่สหกรณ์ ──► แดชบอร์ดเว็บ (ย้ายจาก expense-tracker)
                        ├─ ภาพรวมยอดรับชำระ + กราฟ
                        ├─ คิวตรวจรายการ memberVerified=false
                        ├─ ทะเบียนคำขอบริการ (ServiceRequest log ใหม่)
                        ├─ จัดการฐานความรู้ (อัตราดอกเบี้ย ฯลฯ)
                        └─ ส่งออก CSV ให้ฝ่ายบัญชี
```

### ลำดับงานที่แนะนำ (เรียงตามผลตอบแทน/ความเสี่ยง)

1. **ย้ายแดชบอร์ดเข้า line-bot-nktsc** — ใช้โค้ดเดิมจาก expense-tracker เกือบทั้งหมด (components + API มี pattern เดียวกัน) ได้เครื่องมือเจ้าหน้าที่ทันทีโดยไม่แตะ bot logic
2. **เพิ่มคิวตรวจสอบ** — filter `memberVerified=false` + ปุ่ม "ยืนยันแล้ว" (อัปเดตธง + เพิ่มแถวใน `MemberRoster` ถ้ายังไม่มี เพื่อให้ครั้งถัดไปตรวจผ่านอัตโนมัติ)
3. **บันทึกประวัติการส่งต่อ** — เพิ่มตาราง `ServiceRequestLog` (ใคร ขออะไร ส่งถึงใคร เมื่อไร สถานะ) เขียนก่อนลบ `PendingServiceRequest` — ได้ทั้ง audit trail และรายงานปริมาณงานต่อเจ้าหน้าที่
4. **ย้ายฐานความรู้ลงฐานข้อมูล** — ตาราง `KnowledgeEntry` (หัวข้อ, เนื้อหา, วันที่แก้) แล้วประกอบเข้า system prompt ตอน runtime + หน้าแก้ไขบนแดชบอร์ด → เจ้าหน้าที่แก้อัตราดอกเบี้ยเองได้โดยไม่ต้อง deploy (คงหลักการ "ควบคุมเนื้อหา 100% ไม่ค้นเว็บสด" ไว้เหมือนเดิม)
5. **ใส่ authentication ให้แดชบอร์ด** — จำเป็นก่อนเปิดใช้จริง เพราะข้อมูลเป็นธุรกรรมการเงินและข้อมูลส่วนบุคคลของสมาชิก (แนะนำเริ่มจาก Basic Auth ผ่าน middleware ของ Next.js หรือ NextAuth ตามความพร้อม)
6. **เพิ่ม test ขั้นต่ำ** — unit test สำหรับ validation ใน tool handlers, dedupe logic, และ `stripDisallowedLinks`

### หมายเหตุด้าน Claude API

- โครง agent ปัจจุบัน (แยกโมเดล Haiku/ข้อความ กับ Sonnet/รูปสลิป, บังคับ `tool_choice` บนรูป, final call แบบปิด tools) เป็น pattern ที่เหมาะสมกับงาน webhook ที่ต้องจบใน 60 วินาทีอยู่แล้ว — ควรคงไว้
- system prompt ยาวและคงที่ (ฐานความรู้ + กติกา) เหมาะกับ **prompt caching**: ใส่ `cache_control: {type: "ephemeral"}` ที่ท้าย system block และย้ายส่วนแปรผัน (วันที่วันนี้, pendingNote) ไปไว้ใน user message แทน — ลดต้นทุน input ต่อข้อความได้มาก เพราะทุก webhook ส่ง system เดิมซ้ำ
- ถ้าย้ายฐานความรู้ลงฐานข้อมูล (ข้อ 4) ให้ประกอบ system prompt แบบ deterministic (เรียงลำดับคงที่) เพื่อไม่ทำลาย cache

---

## 5. สรุป

ทรัพย์สินหลักที่มีอยู่คือ 2 ระบบที่ใช้โครงเดียวกัน: **expense-tracker** เป็นต้นแบบที่มี "ฝั่งเจ้าหน้าที่" (แดชบอร์ด/รายงาน) ครบ ส่วน **line-bot-nktsc** เป็นระบบงานจริงที่มี "ฝั่งสมาชิก" (agent, ยืนยันตัวตน, ตรวจสลิป, ส่งต่องาน) ครบ — การประยุกต์ใช้ร่วมกันที่คุ้มที่สุดคือ **ยกแดชบอร์ดจากต้นแบบมาประกบกับฐานข้อมูลสหกรณ์** แล้วเติมคิวตรวจสอบ, ทะเบียนคำขอบริการ, และหน้าแก้ไขฐานความรู้ ตามลำดับข้างต้น ก็จะได้ระบบบริการจัดการสหกรณ์ครบวงจรทั้งฝั่งสมาชิกและฝั่งเจ้าหน้าที่ โดย reuse โค้ดเดิมเกือบทั้งหมด
