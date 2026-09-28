# 인수인계서 — 태국 세금계산서 · 영수증 장부 (Thai Receipt Ledger)

> 이 프로젝트를 이어받는 개발자(AI 포함)를 위한 문서예요. **UI를 포함해 자유롭게 바꿔도 됩니다.**
> 다만 아래 "지켜 주세요"(7번)는 회계 정확도 · 데이터 보존과 관련이 있으니 유지해 주세요.
>
> - 원래 지시서: [`docs/PROMPT.md`](PROMPT.md) (전체 요구사항, 9단계 진행 순서)
> - 기준 시제품: [`docs/reference/prototype-ledger.html`](reference/prototype-ledger.html)
> - 4단계까지의 상세 기록: [`docs/REVIEW.md`](REVIEW.md) (설계 결정, 시제품과 다르게 한 것)
> - 외부 검수 결과 (9건 모두 수정됨): [`docs/review-findings/REVIEW-FINDINGS.md`](review-findings/REVIEW-FINDINGS.md)
> - 작성 2026-09-24 · 마지막 갱신 2026-09-26 (운영 배포 · 멤버 관리 · 12시간 로그인 · 일본어 기본까지)

---

## 1. 한눈에 보기

태국 회사 직원들이 세금계산서 · 영수증 **사진을 올리면 → AI가 읽고 → 원본과 같은 배치로 태국어 · 영어 · 일본어 양식을 만들고 → 계산을 자동 확인해서 → 장부에 저장**하는 웹앱이에요.

- 사용자: 회사 직원 여러 명 (관리자 + 일반 직원). 우리 회사는 주로 **구매자** 쪽이에요.
- 모바일 우선 (휴대폰 · 컴퓨터 모두). 휴대폰은 하단 탭 바, 컴퓨터는 상단 알약 메뉴.
- 화면 언어 4개: 한국어 · 태국어 · 영어 · 일본어 / **양식 언어 3개: 태국어 · 영어 · 일본어** (한국어 양식은 사용자가 원하지 않아 되돌렸어요 — 한국어는 화면에만)

**지금 된 것**
- 계산 규칙과 테스트(외부 검수 결함 9건 수정 포함), 정리된 양식(보기 / 고치기 / 인쇄), 양식 설정
- 애플 인텔리전스풍 UI (라이트 · 다크), 로고 · 파비콘 · **앱 이름 Sawadee TAX**(2026-09-26, 4개 언어 모두 같은 이름 — `app.appName`, 메일 템플릿, LINE 인사말. 로고 · 빛나는 효과는 그대로)
- 사진 올리기: **한 번에 최대 5장 동시 AI 읽기** + `/api/extract` (실제 키로 확인 완료 · 정확도 평가 스크립트 있음 — 5번 ②)
- 태국 세금계산서 요건: 필수 기재 사항 검사(국세법 86/4 · 고시 199호), 판매자 본사/지점, 매입세액 공제 기한 3년 — `docs/thai-tax-invoice-check.md`
- 서명: 보기 화면에서 직접 타이핑 또는 "서명 있음" 표시, 인쇄 시 편집 표시 숨김
- 장부: **월별 보관함("2026년 9월분")**, 색 스티커 7종 + 필터, **임시저장**, 관리자만 삭제 · **삭제 사유 필수 · 휴지통(소프트 삭제) · 복원**, 분쇄기 애니메이션
- **5단계 완료: Supabase DB · 매직링크 로그인(초대제) · 관리자/직원 권한(RLS) · 비공개 사진 저장소 · 변경 기록** (5번 ③)
- **7단계: 거래처 사전**(저장 시 자동 등록 · 새 AI 읽기의 이름을 사전으로 통일 · 빈 칸만 채움) · **월별 엑셀(XLSX) · PDF 보고서**(인쇄로 PDF 저장)
- **8단계: 대시보드(첫 화면)** — 이 달 4칸 요약 · 곧 지급할 청구서(바로 "지급 완료" + 되돌리기) · 최근 6개월 매입 차트(표 보기) · 최근 기록, 서류 화면에 그 서류의 기록
- **LINE 봇(1:1)**: 설정에서 받은 코드로 계정 연결 → 사진을 보내면 AI가 읽어 장부에 바로 저장, 태국어 · 일본어 결과 카드로 답장 (7-3)
- 설정: 내 계정 · 우리 회사 세금번호 · 직원 관리(초대 · 권한) · 스티커 이름 · 양식 설정

- **운영 중:** https://thai-receipt-ledger.vercel.app (Vercel + Supabase 싱가포르, 7-5) · 멤버 관리(접근 해제 · 메일 보내기) · 장부 검색 · 지급 기한 LINE 알림 · 매입세액 보고서

**아직인 것:** Playwright 테스트를 저장소 안으로(지금은 `work/*.cjs`), README, 백업(월 1회 내려받기 등), AI 사용량 · 비용 표시, 오류 알림, 월 마감 잠금(제안만)

> 장부 · 사진 · 권한 · 설정은 이제 모두 Supabase에 저장돼요. 로컬 개발은 Docker 위의 로컬 Supabase를 써요 (2번).

---

## 2. 실행 방법

```bash
npm install
# Docker Desktop을 켠 뒤 (처음엔 이미지 내려받느라 몇 분)
npm run db:start            # 로컬 Supabase: API 54321 · Studio 54323 · 메일(Mailpit) 54324
npm run db:bootstrap -- you@company.com "이름" --sample   # 첫 관리자 + 예시 서류 · 사진 (다시 실행해도 안전)
npx next dev --turbopack -p 3130   # http://localhost:3130/ja → 로그인 화면 (기본 언어 일본어)
npm test                    # Vitest 124개 (lib/**/*.test.ts)
npm run db:test             # DB 규칙 테스트 35개 (pgTAP, 전부 롤백)
npm run eval:extract        # AI 정확도 평가 (ANTHROPIC_API_KEY 필요, 유료 호출 1회)
npx tsc --noEmit            # .next/types 관련 TS6053은 오래된 빌드 캐시 — 무시하거나 .next 삭제
npx eslint app components lib scripts middleware.ts
```

- Node 24에서 개발했어요.
- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`(로컬 값은 `npx supabase status -o env`), `ANTHROPIC_API_KEY`. 나머지는 `.env.example` 참고.
- **로그인:** 가입은 꺼져 있어요(초대제). `/ja/login`(기본 일본어)에 초대된 이메일을 넣으면 매직링크가 가요 — 어느 브라우저에서 열어도 돼요. 로컬에서는 메일이 실제로 나가지 않고 **Mailpit(http://127.0.0.1:54324)** 에 쌓여요.
- DB를 처음 상태로: `npm run db:reset` 후 `db:bootstrap`을 다시 실행.
- 주요 화면

| 경로 | 화면 |
|---|---|
| `/ko` | 홈 (사진 올리기 · 예시 서류 · 양식 설정 입구) |
| `/ko/upload` | 사진 올리기 (최대 5장 동시 읽기 → 확인 → 저장 / 임시저장) |
| `/ko/documents/sample` | 예시 서류 (저장하면 장부에 사본이 들어가요) |
| `/ko/documents/<uuid>` | 장부에 저장된 서류 |
| `/ko/ledger` | 장부: 월별 보관함 · 임시저장 · 휴지통(관리자) |
| `/ko/login` | 로그인 (매직링크) · `/ko/auth/callback` 링크 도착 화면 |
| `/ko/settings` | 내 계정 · 회사 세금번호 · 직원 관리(관리자) · 스티커 이름 · 양식 설정 |

---

## 3. 기술 스택

| 역할 | 사용 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15.5 (App Router) + TypeScript strict | `app/[locale]/…`, 개발 배지는 끔(`next.config.ts`) |
| UI | shadcn/ui + Tailwind v4 | `components/ui/`는 shadcn 원본 (button: 알약 모양 · 누르면 살짝 작아짐, input: 둥근 모서리 · 흰 배경만 수정) |
| 글꼴 | 모두 OFL 오픈소스, `next/font`로 자체 호스팅 | Inter(영문) · Noto Sans Thai · Noto Sans JP · IBM Plex Sans KR · IBM Plex Mono / 서명: Caveat · Charm · Yomogi · Nanum Pen Script |
| 아이콘 | lucide-react (ISC) | 로고도 lucide 모양으로 그림 (`components/layout/app-mark.tsx`) |
| 폼 | react-hook-form + zod v4 | `lib/doc-schema.ts` |
| 다국어 | next-intl v4 | `messages/{ko,th,en,ja}.json` |
| AI | `@anthropic-ai/sdk` — `messages.create`, 프롬프트로 JSON → zod 검사 → `normalize()` | 모델 `claude-opus-5-5`(기본), effort 실서비스 `low`(Vercel `ANTHROPIC_EFFORT`, 코드 기본값 `medium`). 읽기 코드 `lib/extract-server.ts` |
| 사진 | browser-image-compression · heic2any · react-zoom-pan-pinch | 올리기 전 방향 보정 · 아이폰 HEIC → JPG · 축소 |
| DB · 로그인 · 사진 | Supabase (Postgres · Auth · Storage), 로컬은 Supabase CLI + Docker | `supabase/`, `lib/supabase/` |
| 테스트 | Vitest | Playwright는 설치돼 있지만 프로젝트 안에 테스트는 아직 없어요 (8번 참고) |

---

## 4. 구조

```
app/
  globals.css                  디자인 토큰(애플 그레이 · 시스템 블루 · 애플 인텔리전스 그라데이션),
                               공용 클래스(.workspace-panel .ai-ring .ai-orb .segmented-control .nav-pill .tab-bar
                               .review-actions), 서명 커서, 분쇄기 애니메이션, @media print
  icon.svg / apple-icon.png    파비콘 · 아이폰 홈 아이콘 (app-mark.tsx에서 생성 — 8번)
  api/extract/route.ts         AI 읽기 (서버 전용, 사진 1장 = 요청 1개, 1분 10회 제한)
  [locale]/layout.tsx          html · 글꼴 변수 · 테마 · next-intl
  [locale]/(app)/layout.tsx    머리글 + 하단 탭 바 + 양식 설정 Provider
  [locale]/(app)/page.tsx      홈
  [locale]/(app)/upload        사진 올리기
  [locale]/(app)/documents/[id]  SampleReview.tsx(id=sample) / StoredReview.tsx(장부 서류)
  [locale]/(app)/ledger        장부 (월별 보관함 · 임시저장 · 휴지통)
  [locale]/(app)/settings      내 권한 · 스티커 이름 · 양식 설정
  [locale]/(app)/vendors       자리 표시

components/invoice/            정리된 양식 (핵심 UI)
  DocumentReview.tsx   사진 + 양식 + 자동 확인 + 저장 / 임시저장 / 인쇄 / 삭제. RHF FormProvider, useWatch → normalize → runChecks
  DeleteFlow.tsx       권한 확인 → 삭제 사유 창 → 분쇄기 애니메이션 → onDeleted
  InvoiceView.tsx      보기 모드 (signable이면 서명 칸에 바로 입력)
  InvoiceEdit.tsx      고치기 모드
  SignBoxes.tsx        서명 칸: 타이핑 + "서명 있음" + 인쇄용 모양
  TriText / TriInput, ItemsTable, TotalsLadder, ChecksPanel, PhotoViewer, fields, form-inputs, form-config-context
components/upload/BatchUpload.tsx      최대 5장 올리기 · 진행 표시 · 확인 화면 · MaxNotice 배지
components/ledger/LedgerList.tsx       월별 보관함 · 필터 · 임시저장 · 휴지통 목록
components/ledger/Stickers.tsx         스티커 점 · 선택기 · 목록용 팝오버 · 이름 설정, useMonthLabel
components/settings/                   FormSettings(양식) · RoleSettings(내 권한, 임시)
components/layout/                     머리글(app-header) · 로고(app-mark) · 언어(🌐 메뉴) · 테마

lib/                           규칙과 데이터 (UI와 무관, 테스트 있음)
  types.ts           LedgerDoc (+ signs.*Sign 서명 글자, stickers)
  money.ts           사탕(1/100 바트) 정수 계산
  thai-tax.ts        taxIdOk, fixDate(불교력→서기), addDays, dmy, todayBangkok
  baht-text.ts       thaiInt, bahtText, amountWords
  normalize.ts       AI 답 / 저장본 → LedgerDoc
  checks.ts          runChecks(자동 확인 13개), flagsFor, claimable
  doc-schema.ts      zod (편집 폼)
  extract-schema.ts  zod (AI 답 모양), parseReply, MAX_PHOTOS, 오류 코드
  extract-server.ts  (서버 전용) 사진 1장 읽기 — /api/extract와 평가 스크립트가 함께 씀
  extract-eval.ts    AI 답 ↔ 정답 칸별 비교 (scripts/eval-extract.ts에서 사용)
  archive.ts         월별 묶기(monthKey, groupByMonth), 스티커 · 미지급 필터
  export.ts          월별 내보내기 데이터(서류 행 · 품목 행 · 사탕 합계), 화면 언어 + 태국어 원문 칸
  export-xlsx.ts     엑셀 파일 (exceljs, 내려받을 때만 불러옴)
  vendors.ts         거래처 사전 규칙(applyVendor: 이름은 사전 값, 주소 등은 빈 칸만) · vendor-store.ts(Supabase)
  sample.ts          예시 서류 (참고 JSON + 종이에 인쇄된 판매자 본사)
  form-labels.ts / form-config.ts      양식 칸 이름 · 양식 설정
  ── 데이터 (Supabase) ──
  supabase/{client,server,admin}.ts  브라우저(anon) · 서버(쿠키 세션) · 서비스 키(서버 전용)
  db-map.ts            LedgerDoc ⇄ documents / document_items 행
  ledger-store.ts      장부 · 사진(비공개 버킷, usePhotoUrl), 임시저장, 소프트 삭제 · 복원
  role-store.ts        로그인한 직원(useMe) · 이름 저장 · 로그아웃
  company-store.ts     회사 설정 한 줄(세금번호 · 양식 설정 · 스티커 이름)
  sticker-store.ts / form-config-store.ts   위 회사 설정 위의 얇은 훅
  upload-queue.ts      올리기 대기열 (메모리)

supabase/        config.toml(초대제 · 인증 URL), migrations/(스키마 · RLS · 트리거 · save_document), tests/(pgTAP)
scripts/         bootstrap.ts(첫 관리자 · 예시 서류), eval-extract.ts(AI 정확도)

messages/        화면 문구 4개 언어. labels.*는 양식 칸 이름(th/en/ja 파일이 양식에 쓰임)
docs/            지시서, 참고 파일, 검수 · 인수인계 문서, review-findings/(외부 검수 결과)
```

**데이터 흐름:** 사진(최대 5장) → 브라우저에서 정리(HEIC 변환 · 방향 · 축소) → `/api/extract`에서 Claude가 JSON으로 읽음(zod로 모양 검사) → `normalize()` → 올리기 화면 목록 → 확인하기(`DocumentReview`) → **장부에 저장**(final) 또는 **임시저장**(draft) → 장부(월별 보관함)

---

## 5. 남은 일 — 이 순서를 추천해요

### ① 외부 검수 결함 9건 — ✅ 모두 수정 (2026-09-24)

상세: [`docs/review-findings/REVIEW-FINDINGS.md`](review-findings/REVIEW-FINDINGS.md). 회귀 테스트는 `lib/review-fixes.test.ts`(번호별 describe)에 있어요.

| # | 문제 | 고친 방법 |
|---|---|---|
| 1 | Enter 저장 시 고치기 전 금액 | `MoneyInput`이 입력할 때마다 폼 값을 갱신 (blur는 표시 정리만). Controller의 ref · onBlur도 연결 |
| 2 | 0을 미기재로 취급 | 합계 흐름 · VAT · 최종 합계 · 품목 합계 검사를 항상 실행. 수량과 단가가 **둘 다 0**인 줄만 "금액만 적힌 줄"로 봄 |
| 3 | 없는 날짜 허용 · 오류 | `isIsoDate`가 실제 달력으로 확인, `fixDate`는 없는 날짜를 ""로, 편집 스키마도 같은 규칙. 잘못된 날짜는 "invalid"로 표시 |
| 4 | 태국어 금액 글자 불일치 | `wordsPrinted`가 태국어 줄의 유일한 원본 (없으면 `bahtText(net)`). 고치기 화면의 두 번째 입력칸은 읽기 전용 미리보기로 |
| 5 | 수량 반올림 · 기본값 1 | `parseQty`(소수 4자리) · `fmtQty`, 기본값 없음(빈 수량 = 0). 줄 검사는 수량 × 사탕 단가를 마지막에 한 번만 반올림 |
| 6 | 긴 세금번호 잘림 | 13자리로 자르지 않음 → 세금번호 검사가 실패로 잡음 (스키마는 숫자 20자리까지 허용해 저장 · 표시 가능) |
| 7 | 흐린 숫자 · 빈 칸 배지 없음 | 공용 래퍼 `Flag`(TriText.tsx)를 품목 모든 칸 · 합계 · 날짜 · 번호 · 세금번호에 적용, 빈 칸도 배지 유지. 자동 확인 패널에 칸별 이동 버튼 |
| 8 | 회사 번호 없이도 claimable | 유효한 회사 세금번호가 있고 구매자와 같을 때만 true |
| 9 | VAT 허용 오차 올림 | `차이 ≤ 100사탕 또는 차이 × 500 ≤ 과세 사탕` 정수 비교 |

- 2 · 3 · 5 · 6은 시제품에서 옮겨 온 동작을 바꾼 거라, 기존 테스트 2개의 기대값도 바꿨어요 (`claimable(doc, "")` → false, 빈 수량 → 0). 각 줄에 이유를 주석으로 남겼어요.
- 알아 둘 점: 수량이 없고 단가 · 금액만 있는 줄은 이제 품목 검사에서 "확인 필요"로 잡혀요 (수량을 알 수 없으니까요).

### ② AI 읽기 실제 확인 — ✅ 완료 (6단계)

- ✅ 실제 키로 확인했어요 (2026-09-25). `npm run eval:extract` = 예시 사진을 실제로 읽혀 `sample-document.json`과 칸마다 비교 (`--effort high`, `--runs 3` 가능, 결과는 `eval-results/`, git 제외).
- 첫 결과 (effort medium, 1회, 47.6초, 약 $0.13): **숫자 · 코드 · 날짜 33/34**, 인쇄된 태국어 12/15, 영어 9/15, 자동 확인은 "흐린 칸" 외 전부 통과.
  - 틀린 숫자 · 코드 1개(`seller.branchCode`)는 AI가 스스로 흐림 표시.
  - 태국어: 단위 ลัง → กล่อง(실제 오류), 제목에 "ต้นฉบับ(원본)"이 붙음(프롬프트 모호), 지역명 한 글자 누락(흐림 표시함).
  - 영어 불일치 대부분은 표기 차이(Rd. ↔ Road, Sunyu ↔ Sanyu 등). 채점이 엄격해서예요 — 필요하면 `lib/extract-eval.ts`의 비교 규칙을 조정하세요.
- **답 받는 방식:** 프롬프트로 JSON을 받고 zod로 검사해요. `claude-opus-5-5`는 강제 tool_choice를 400으로 거절하고, 이 크기(약 60칸)의 구조화 출력 스키마는 "compiled grammar is too large"로 거절해요 (totals의 null 허용 10개를 빼면 통과하는 한계선). 그래서 시제품처럼 JSON을 받아 `extractSchema.safeParse`로 모양을 확인(평가 스크립트에 불일치 수 표시)하고 `normalize()`로 정리해요.
- 다음에 해 볼 것: effort `high` 비교, 다른 영수증 사진으로 평가 세트 늘리기, 제목에 원본/사본 표시를 넣지 말라는 규칙을 프롬프트에 추가.

### ③ 5단계: Supabase (DB · 로그인 · 권한) — ✅ 완료 (2026-09-25)

- **스키마:** `supabase/migrations/` — 지시서 5번 표(`documents` · `document_items` · `vendors` · `company_settings`)에 더해 `members`(역할), `document_events`(변경 기록), `status`(draft/reviewed), `stickers`, `field_boxes`, 소프트 삭제 3칸(`deleted_at` · `deleted_by` · `delete_reason`, 사유 2자 이상 제약), `company_settings.form_config` · `sticker_names`.
- **저장:** `save_document(p_id, p_row, p_items)` RPC — 서류와 품목을 한 트랜잭션으로 저장, 넘긴 칸만 씀. 앱 ↔ DB 변환은 `lib/db-map.ts`(왕복 테스트 있음).
- **권한(RLS + 트리거):** 직원 = 읽기 · 추가 · 수정 / 관리자 = + 소프트 삭제 · 복원 · 휴지통 · 회사 설정 · 직원 관리. **DELETE 정책이 없어 누구도 영구 삭제 못 함.** 작성자 · 수정자 · 삭제자는 DB가 기록(브라우저 값 무시). 마지막 관리자는 강등 불가. 직원이 아닌 로그인 사용자는 아무것도 못 봄.
- **로그인:** 매직링크 + 초대제(`config.toml`의 `enable_signup = false`). 관리자 초대는 `/api/members`(서비스 키, 서버 전용). 초대 메일 링크는 `#access_token`(implicit) 형식이라 `AuthCallback`이 직접 세션을 설정해요 — PKCE 브라우저 클라이언트는 이 형식을 거부하기 때문. 2026-09-26부터 로그인 화면에서 보내는 링크도 implicit이에요(7-6).
- **사진:** 비공개 버킷 `documents`, 화면에는 1시간짜리 서명 URL(`usePhotoUrl`). 장부 목록은 사진 옆의 작은 사본 `<사진>.thumb.jpg`(짧은 변 160px, 약 10KB)를 써요. 새 사진은 저장할 때 만들어지고, 사본이 없는 예전 사진(LINE으로 받은 사진 포함)은 목록에 한 번 뜰 때 브라우저가 만들어 올려요(`healThumb`). 서명 URL은 한 번에 모아서 요청하고(`createSignedUrls`), 장부 데이터는 30초 안에 다시 연 화면이면 새로 받지 않아요(`FRESH_MS`).
- **월 마감 (2026-09-26):** 관리자가 장부의 달 옆 "이 달 마감"으로 신고가 끝난 달을 잠가요(`month_locks`). 그 달의 저장된 서류(`reviewed`)는 추가 · 수정 · 다른 달로 옮기기 · 삭제가 데이터베이스에서 막히고(트리거, pgTAP 12개), 지급 표시 · 스티커만 바뀌어요(`setQuick`, 서류를 다시 저장하지 않음). 임시저장은 자유. "마감 풀기"로 언제든 해제.
- **사진 품질 검사:** 올린 사진이 어둡거나 흐리거나 작으면 AI로 보내기 전에 "다시 찍기 / 그대로 읽기"를 물어요(`lib/photo-quality.ts`, 기준은 실제 사진으로 느슨하게 잡음).
- **길고 좁은 전표(편의점 영수증 등):** 긴 쪽이 짧은 쪽의 2배를 넘으면 폭을 최대 1200px로 유지해 올리고, 서버가 위→아래로 겹치게 최대 8조각으로 잘라 한 번에 AI에게 보내요(`lib/slip-tiles.ts`, `lib/extract-server.ts` photoBlocks). 전표는 폭 450px부터 "작음"으로 봐요. 34줄 전표 실험: 품목·합계 모두 일치, 약 $0.14.
- **다른 양식 대응 (2026-09-26):** 읽기 지침에 규칙 추가 — ใบวางบิล(대금 청구서)은 docType "other"로 읽고 청구서 번호를 품목 code에, 부가세는 null(중복 계산 경고를 note에); 금액 글자가 영어인 양식은 그대로 옮김(검사는 태국어일 때만 비교, 아니면 "해당 없음"); 지점번호 5자리 규칙(BRANCH 04 → 00004); 부가세 없는 영수증·청구서는 7% 검사를 "해당 없음" 처리. 실물 2장(PANFOOD ใบวางบิล, KOBE-YA 세금계산서)으로 확인.
- **항목·결제방법 자동 입력 (2026-09-26):** AI가 읽을 때 규칙에 따라 채우고(지침에 판단 기준 추가), 같은 거래처(세금번호 일치)의 **가장 최근 저장 서류의 항목·결제방법이 새 읽기를 덮어씀**(`lib/vendors.ts applyHistory`; 앱 업로드는 `lib/vendor-store.ts withVendor`, LINE 사진은 `lib/line-bot.ts`). 바뀐 칸은 업로드 화면 거래처 칩에 표시되고 언제든 손으로 고칠 수 있음.
- **버튼 문구·최적화 (2026-09-27):** 행동 버튼은 상태처럼 안 보이게 테두리 버튼 + "지급 완료로 표시" / "문제 없음으로 표시"(4개 언어). 지급 표시·스티커·문제 없음·여러 건 지급은 장부 전체를 다시 받지 않고 그 서류만 메모리에서 고침(`lib/ledger-store.ts patchEntries`) — 장부 다운로드는 서류당 약 4.6KB라 1,000건이면 4.6MB. 다음 후보: 목록용 조회에서 field_boxes(약 19%) 빼고 서류 화면에서만 받기(저장 때 빈 값으로 덮어쓰지 않게 주의). 빌드 크기: 가장 큰 페이지 약 390KB, 엑셀·PDF·HEIC 도구는 쓸 때만 로드.
- **미지급 기준 (2026-09-27, 두 번째 수정):** 미지급 = "지급 완료" 체크 안 됨(`lib/archive.ts isUnpaid`), 사람이 체크한 게 항상 이김. 대신 새로 읽은 영수증 중 현금·이체·카드이고 기한이 없는 것은 처음부터 지급 완료(지급일 = 서류 날짜)로 들어옴(`paidAtTill`: 앱 업로드·LINE). 체크를 풀면 지급일도 지움. 장부 표시·"미지급만" 필터·달별 미지급 수·여러 건 지급·서류 화면·대시보드가 같은 기준. (첫 수정의 "이체+기한 없음 = 낸 것" 규칙은 사람이 체크를 풀어도 미지급이 안 돼서 바꿈)
- **"문제 없음" (2026-09-27):** 장부 줄의 "확인 필요" 옆 버튼 / 서류 화면의 막대(`components/invoice/AckBar.tsx`). 누르면 그때 걸린 경고 키를 `documents.ack_flags`에 저장(누가·언제는 DB가 기록, 마감 달에도 가능 — migration `20260927000900_ack`, pgTAP 5개). `lib/dashboard.ts openWarnings`가 받아들인 경고를 빼고 계산 → 장부 배지·대시보드 숫자·하나씩 확인하기에서 빠짐. 나중에 새 경고가 생기면 다시 켜짐. 경고만 끄고 공제 여부는 안 바뀜. "다시 확인 필요로"로 되돌림.
- **매출 1단계 (2026-09-27, 사용자 결정: 매장 POS + 배달 앱, 마감 영수증 사진 + POS 엑셀, 보고서 = 월별 결과 + 매출세 보고서):**
  - DB `20260927000800_sales`: `public.sales` 하루×판매 경로(store·grab·lineman·foodpanda·shopee·robinhood·other) 한 줄, (날짜, 경로) 유일, 금액 VAT 포함(gross)·vat·exempt·영수증 번호 범위·장수. 회원 추가·수정, 삭제는 관리자, 마감 달은 못 바꿈(`sales_guard`, pgTAP 7개).
  - 메뉴 "매출"(`/sales`, `components/sales/SalesPage.tsx`): 마감 영수증 사진·PDF → AI 읽기(`/api/extract-sales`, `lib/extract-sales.ts`) → 확인 시트(`SaleSheet`) → 저장(같은 날·경로면 교체). 직접 입력도 가능.
  - 이번 달 결과(`lib/sales.ts monthResult`): 매출(VAT 제외) − 매입 비용(지급액 − 공제 가능 VAT) = 이익, 이익률, 낼 부가세(매출 VAT − 공제 VAT), 경로별 합계. 매입은 계산서 날짜 기준, 장부 밖 비용(인건비 등) 미포함 안내.
  - 매출세 보고서 `/sales/report/[month]`(รายงานภาษีขาย, 태국어·불기 월): 하루×경로 한 줄, 약식 세금계산서는 번호 범위로 요약.
  - POS 엑셀 가져오기(매출 화면 "POS 엑셀", `components/sales/PosImport.tsx`): .xlsx/.csv(UTF-8·Windows-874) 읽기(`lib/pos-read.ts`), 제목 줄·칸 자동 찾기(태국어·영어 키워드), 영수증 단위든 일 단위든 하루×경로로 합침(`lib/pos-import.ts aggregate`: 불기·엑셀 날짜 번호·월 이름, 합계 줄 건너뜀, 영수증 번호 범위·장수, VAT 칸 없으면 부가세 전 금액 또는 7/107). 칸은 드롭다운으로 바꿀 수 있고 미리보기 후 한 번에 저장(`saveSalesBulk`: 마감 달·마이너스 날은 건너뛰고 알림). 옛 .xls는 .xlsx로 저장 안내. 실제 사용자 POS 파일로는 아직 미검증.
  - 남은 것: 지점(สาขา)별 신고가 필요한 경우 지점 구분(지금은 한 사업장 기준).
- **원본 파일 보관 · 다운로드 (2026-09-27):** PDF로 올린 서류는 PDF 원본을 그림 옆에 그대로 저장(`{id}/{ts}.pdf`, `originalPdfPath`; 버킷에 application/pdf 허용 — migration `20260927000700_bucket_pdf`, pgTAP 1개). 완전 삭제 때 같이 지움. 서류 화면 원본 사진 칸에 "PDF 원본"(있을 때)·"사진" 다운로드 버튼(1시간짜리 링크, 파일명 = 문서번호). 사진은 올릴 때 줄인 JPEG(긴 쪽 2400px)가 원본으로 저장됨. 이전에 PDF로 올린 서류는 원본 PDF가 없음.
- **연속 촬영 (freee식 자동 올리기, 2026-09-27, 사용자 결정: 한 번에 두 장씩):** 올리기 화면 "연속 촬영" → 앱 안 카메라(`components/upload/ContinuousCamera.tsx`, body에 portal). 셔터마다 바로 대기열에 들어가 AI가 읽음. 기본 "2장씩": 가운데 안내선 기준 왼쪽·오른쪽 반을 잘라 **따로** 읽음(해상도 손실 없음, 비용은 장당 같음). 직전 사진과 같은 장면이면 건너뜀(8×8 평균 해시, `lib/shot-hash.ts`, AI 비용 0). 대기열은 30장(`MAX_QUEUE`), 읽기는 5장씩 차례로(`queued` 상태), 서버 한도 1분 30회. 카메라 권한이 없으면 기본 카메라 앱으로. 올리기 화면 위 안내 카드 2개(`components/upload/UploadTips.tsx`: 두 장씩 찍기 · 최대 30장).
- **일본어 사용자용 날짜 (2026-09-27):** 앱 화면(대시보드·장부·거래처·부가세 카드)의 날짜는 일본어 화면에서 `2026/09/27（日）`(`lib/screen-date.ts`, `useScreenDate`). 태국 공식 양식(세금계산서 사본·보고서·50 ทวิ)은 그대로 dd/mm/yyyy.
- **자동 등록 규칙 (freee식, 2026-09-27, 사용자 결정: 거래처별로 켜기):**
  - DB `20260927000600_vendor_rules`: vendors에 `rule_category`, `rule_payment`, `auto_register`. 규칙(항목·결제)은 회원 누구나, `auto_register`는 **관리자만**(트리거 `vendors_rule_guard`, pgTAP 5개).
  - 적용 순서: AI → 지난 저장값 → **거래처 규칙**(`lib/vendors.ts applyRule`), 앱 업로드·LINE 모두.
  - 확인 없이 저장: 앱 업로드에서 `auto_register` 켠 거래처 + 신뢰도 low 아님 + **자동 확인 전부 통과**(중복 포함)일 때만 바로 장부에(`lib/upload-queue.ts autoSave`, 상태 "saved"). 하나라도 걸리면 평소처럼 "확인하기". (LINE 사진은 원래부터 바로 장부에 저장되고 걸리면 "확인 필요" 표시)
  - 거래처 화면에서 규칙 설정(`components/vendors/VendorRule.tsx`). 같은 거래처를 같은 항목·결제로 3번 저장하면 "앞으로 자동으로 할까요?" 알림(`useOfferRule`; 관리자는 확인 없이 저장까지 켜짐).
  - 대시보드·장부 위에 "사진 올리기 + 직접 입력" 버튼 한 쌍(`components/upload/AddDocButtons.tsx`).
- **태국 양식 점검 (2026-09-27, 국세청 1차 자료 기준):**
  - 맞음: §86/4 필수 항목 검사(+Notification 199 지점) · 약식 세금계산서·사본·접대비 공제 불가 · 늦은 공제 6개월(No.4/76) · 매입세 보고서 머리글·칸(No.89: 월, 사업자명, 세금번호, 사업장, 순번, 날짜, 번호, 판매자, 판매자 세금번호, 지점, 금액, 부가세) · ภ.พ.30 기한 15일/인터넷 23일 · 원천징수 세율(ท.ป.4/2528)·기한 7일/15일 · ใบแนบ ภ.ง.ด.3/53 칸 · 50 ทวิ 항목·소득 종류 6줄(서비스·용역은 5번 줄).
  - 이번에 고침: 품목(물건·서비스 설명) 1줄 이상을 필수로(§86/4(5), `missingRequired` → `items.0.desc`) · 직접 입력 서류가 "ใบกำกับภาษี" 제목 + 우리 회사 구매자 정보(최근 서류에서) + 품목 1줄로 시작(`lib/manual-doc.ts`), 간단 카드에 "내용(품명)" 칸 · 50 ทวิ에 3번째 장 "สำเนาคู่ฉบับ"(지급자 보관) · 1,000바트 미만 원천징수 안내(ท.ป.4/2528 ข้อ 12/7, `WHT_MIN_BASE`).
  - **2027년 1월에 다시 확인:** 인터넷 신고 연장(부가세 23일, 원천징수 15일)은 재무부 고시 No.7/8/9로 2027-01-31 신고분까지. 이후 연장 안 되면 `lib/dashboard.ts vatFiling` · WHT 목록 기한 수정 필요.
  - 남은 권고: 전자세금계산서(e-Tax) PDF 원본 파일 보관(구매자도 전자 파일을 5~7년 보관해야 함, 지금은 그림만 저장) · e-WHT 1%(2026–2027) 선택 · 보고서·서류 보관 5년 이상(백업 있음).
- **빠른 확인 카드 (2026-09-27):** 문서 화면 기본 = "간단히"(`components/invoice/QuickCard.tsx`): 판매자·문서번호·날짜·최종 합계·부가세(+7% 계산 버튼)·항목/결제 버튼·지급 완료, 세금 설정은 접힌 칸. AI가 헷갈린 칸은 노란색 + "확인 필요"(누르면 사진의 그 위치). 합계·부가세를 고치면 과세금액·합계 사슬을 다시 맞춤(`lib/quick-totals.ts`; 할인·계약금·면세·원천징수는 유지). "자세히" = 기존 종이 모양 화면(보기/고치기). 선택은 브라우저에 기억(`trl.reviewView`), 직접 입력은 자세히+고치기로 열림.
- **한 언어만 쓰면 자동 번역 + 직접 입력 (2026-09-27):**
  - 저장(임시저장 포함) 때 **한 언어만 바뀐 3개 언어 칸**을 나머지 두 언어로 번역해 덮어씀(`lib/translate-gaps.ts` → `/api/translate` → `lib/translate-server.ts`, 모델은 읽기와 같은 모델·effort low). 안 건드린 칸·두 언어 이상 고친 칸은 번역 안 함 → AI가 읽은 그대로 저장하면 비용 0. 번역 실패해도 입력한 대로 저장(경고 알림).
  - 번역 보이게(2026-09-27): 편집·직접 입력에 "✨ AI 자동 번역" 배지(`components/invoice/TranslateBadge.tsx`), 저장 때 "n칸을 번역했어요" 알림, 직접 입력 카드의 판매자·내용 칸 아래에 나머지 두 언어 표시(`OtherLangs`).
  - 직접 입력: 대시보드 "직접 입력" 또는 올리기 화면 "사진 없이 직접 입력" → `/documents/new`(`ManualReview`). 오늘 날짜의 빈 정식 세금계산서가 **간단히 카드**로 열림(사진 칸 없음, 판매자 이름·세금번호를 화면 언어 한 칸으로 입력 → 저장 때 번역). 사진 없이 저장, 구매자 세금번호가 비어 있으면 회사 세금번호로 채움. 사진 없는 저장 서류도 같은 모양(`manual` = `!photoPath`). 품목 줄은 "자세히"에서.
- **PDF 올리기 (2026-09-27):** 올리기 화면에서 PDF(전자세금계산서 e-Tax Invoice 등)도 받음. 브라우저가 pdf.js로 페이지(최대 4쪽)를 JPEG 한 장으로 그려 미리보기·저장 사진·썸네일로 쓰고, AI에게는 PDF 원본을 document 블록으로 보냄(글자층이 정확) — `lib/pdf-render.ts`, `lib/upload-queue.ts`, `/api/extract`의 `pdf` 필드. PDF는 사진 품질 검사 생략. pdf.js worker·폰트는 `public/pdfjs/`에 복사본(버전 불일치 시 `lib/pdf-render.test.ts`가 실패 → `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/`). 원본 PDF도 저장(2026-09-27부터, 아래 "원본 파일 보관" 참고). LINE으로 보낸 PDF 파일은 아직 미지원.
- **freee식 1단계 (2026-09-27): 거래처 고르기 + 하나씩 확인하기.**
  - 거래처 고르기: 문서 화면 위 "거래처" 줄(`components/invoice/VendorPicker.tsx`). 거래처 목록에서 고르면 판매자 이름·세금번호·주소·지점·전화와 그 거래처의 지난 항목·결제방법이 한 번에 채워짐(`lib/vendors.ts pickVendor`; 같은 거래처면 이 종이에서 읽은 지점 주소·지점번호는 유지).
  - 하나씩 확인하기: 대시보드 부가세 카드의 파란 버튼 → `/documents/{id}?check=1`. 대상 = 임시저장 + 자동 확인에 걸린 저장 서류, 오래된 순(`lib/review-queue.ts`). 위에 "확인 n / 전체" 막대, 저장 버튼이 "확인 완료 → 다음", 건너뛰기·그만하기. 이번 회차에 본 서류는 탭 메모리에 기억(`lib/review-run.ts`), 끝나면 대시보드로.
  - 이후 합의한 3→2→1(PDF · 자동 번역 · 빠른 확인 카드) 모두 완료. 남은 후보: 은행 내역 맞추기 등(대화 기록 참고).
- **"원본 세금계산서로 계산" 체크 (2026-09-26):** AI가 사본(copy)이나 기타 서류로 읽어 공제에서 빠진 문서에만, 세금 항목 줄 아래 파란 박스로 표시(`components/invoice/TaxFields.tsx`). 체크하면 docType full + copyKind original로 바뀌고(해제 시 읽은 값 복원), 저장하면 돌려받을 부가세에 들어감. 문구는 messages 4개 파일 `tax.originalFix*`. PC·모바일 Playwright로 확인.
- **AI 생각 수준 `low` (2026-09-26):** Vercel 환경변수 `ANTHROPIC_EFFORT=low`. 비교(샘플 계산서 2회 + 긴 전표): 세금 칸(숫자·세금번호·날짜·품목)은 medium과 같고 약 40% 싸고 약 2배 빠름. 태국어 부가 칸(배송지 등)은 가끔 1~2칸 더 틀림. Sonnet 5는 태국어·불기 연도를 틀려서 제외. 되돌리기: 환경변수를 `medium`으로 바꾸고 재배포. 확인: `GET /api/extract`.
- **매입세 보고서:** 지점은 국세청 양식 표기("สำนักงานใหญ่" / "สาขาที่ 00012", `branchNo`), 인쇄 페이지마다 위에 회사 · 세금번호 · 과세월.
- **세무 규칙 (2026-09-26, 국세청 원문 확인):** ① 공제 달 `tax_month` — 늦게 받은 계산서는 계산서 다음 달부터 6개월 안의 달로 공제(부가세 고시 4호·76호; 법 조문 3년은 상한일 뿐). 보고서 · 월 묶음 · 대시보드 · 월 마감이 모두 공제 달 기준(`monthKey`). 계산서 달이 마감됐으면 저장 때 다음 열린 달로 자동. ② 공제 불가 `no_claim` — null=자동(접대비 → 불가), 승용차(10인승 이하) 관련은 서류에서 직접 '공제 안 함'. 사본 계산서(`copyKind=copy`)도 불가(고시 42호). ③ 매입세 보고서 지점 칸은 단일 칸 형식(본점 00000, 지점 5자리, 고시 202호 양식 주석). 늦게 공제한 줄에 'ถือเป็นภาษีซื้อในเดือนภาษี mm/yyyy'. ④ 원천징수 `wht_rate`·`wht_type` — 50 ทวิ 증명서(`/documents/[id]/wht`, 5번 줄 = 3 เตรส 명령: 서비스·임대·광고·운송·용역, 1·2부) · 월별 ใบแนบ ภ.ง.ด.53/3 목록(`/ledger/wht/[month]`, 지급한 달 기준, 조건 1, 기한 7일/인터넷 15일). 기준액은 부가세 뺀 금액. 세금번호 0 시작=법인(추정 규칙). e-Withholding 1% 특례는 미반영.
- **부드러운 스크롤:** PC(마우스·트랙패드)만 Lenis(`components/layout/smooth-scroll.tsx`), 휴대폰은 기본 스크롤.
- **완전 삭제 (2026-09-26, 주인 결정):** 휴지통에서만, 관리자만, '삭제' 입력 후. 마감된 달의 저장 서류는 불가. `purge_document`(DB 함수)가 서류 · 줄 · 기록을 지우고 `document_purges`에 무엇을 · 왜 · 누가 지웠는지 남겨요(관리자만 읽기). 사진은 앱이 이어서 지워요(다른 서류가 같은 파일을 쓰면 남김).
- **메뉴 스크롤 버그 수정:** 머리글 메뉴(테마 · 언어 · 계정)는 `modal={false}`, 닫힐 때 버튼으로 돌아가는 포커스는 `preventScroll`(components/ui/dropdown-menu.tsx). 언어를 바꿔도 페이지 위치 유지(`scroll: false`). Lenis는 `stop()`을 쓰지 않아요.
- **백업 (2026-09-26):** `scripts/backup.ts`가 운영 DB의 모든 표(JSON)와 사진을 `문서\SawadeeTAX-backup`에 받아요(사진은 새 것만). Windows 작업 스케줄러 "Sawadee TAX backup"이 매주 월요일 10시(꺼져 있었으면 다음 켤 때) `scripts/backup.cmd`로 실행, 결과는 `backup.log`. 직접 실행: `npx.cmd tsx scripts/backup.ts`. 코드는 아직 GitHub에 없음(원격 저장소 없음) — 주인이 비공개 저장소를 만들면 `git remote add origin …` 후 push.
- **정리 (2026-09-26):** 안 쓰는 react-day-picker · date-fns 제거. 보안 경고 0개: package.json `overrides`로 postcss ≥8.5.23(Next 내부), uuid ≥11.1.1(exceljs). 기록 색인 `document_events (document_id, id desc)`, `documents (vendor_id)`.
- **AI 읽기:** 이제 로그인한 직원만 (`/api/extract` 401/403), 요청 제한도 사람 기준.
- **미들웨어:** next-intl + 세션 갱신 + 로그인 안 했으면 `/{locale}/login?next=…`로.
- **검증:** `npm run db:test`(권한 15개), 브라우저 끝까지 흐름(`work/check-supabase-flow.cjs`, 프로젝트 밖): 로그인 · 관리자 삭제/복원 · 직원 초대 · 직원 제한 · 직원 업로드 → 관리자 화면에 보임 · 중복 경고.
- **배포 때 할 일:** 클라우드 Supabase 프로젝트에 `supabase db push`, 인증 URL(Site URL · Redirect URLs)을 배포 주소로, 메일 발송(SMTP) 설정, `.env`에 클라우드 키.

### ④ 그다음 (지시서 7~9단계)

| 단계 | 남은 것 | 이미 된 것 |
|---|---|---|
| 7 | CSV (사용자가 XLSX · PDF를 골라 보류) | ✅ 거래처 사전, 월별 XLSX, 월별 PDF 보고서, 장부 목록, 인쇄, 지급 처리(대시보드에서) |
| 8 | — | ✅ 대시보드(4칸 · 곧 지급할 청구서 · 6개월 차트 · 최근 기록), 서류별 기록 |
| 9 | Playwright 테스트를 프로젝트에 넣기, README 작성(지금은 create-next-app 기본) | ✅ Vercel 배포(7-5), 휴대폰 · 다크 · 가로 넘침 점검 |

### 제안만 된 것 (사용자와 합의 전)

- 월 마감 잠금(신고한 달은 수정 · 삭제 불가), 원본 종이 보관 위치 칸, 보관 기간(보통 5년 — 회계사 확인 필요) 표시, 캘린더(지급 기한 · 신고 마감일)

---

## 6. 브라우저에만 있는 것

| 무엇 | 어디에 | 비고 |
|---|---|---|
| 올리기 대기열 | 메모리 (`upload-queue.ts`) | 새로고침하면 사라짐. 저장 · 임시저장한 것만 DB에 남아요 |
| 양식 언어 선택 | localStorage `trl.formMode` | 개인 설정이라 그대로 둬도 돼요 |

- 예전 임시 저장소(IndexedDB 장부, localStorage 권한 · 스티커 이름 · 양식 설정)는 모두 Supabase로 옮겼어요. 함수 이름(`useLedger`, `saveEntry`, `softDelete`, `restoreEntry`, `useMe`, `useStickerNames`, `useStoredFormConfig` …)은 그대로라 화면 코드는 거의 안 바뀌었어요.
- 예시 서류(`/documents/sample`)는 장부와 별개예요. 저장 · 임시저장하면 **사본**이 장부에 들어가요.
- 목록은 창에 다시 들어올 때(focus) 새로 읽어요. 실시간 동기화(Realtime)는 아직 안 붙였어요.

---

## 7. 지켜 주세요

1. **`lib/`의 계산 결과를 바꾸지 마세요.** 바꿔야 한다면 테스트를 먼저 고치고 `npm test`가 통과해야 해요. 돈 계산은 사탕 정수로 해요 (월별 합계도 `archive.ts`에서 사탕으로 더해요).
2. **API 키는 서버에서만** 써요 (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). `.env*`는 git에 올리지 않아요 (`.gitignore`에 있음).
3. **서류는 영구 삭제하지 않아요.** 삭제 = 소프트 삭제 + 사유 필수 + 관리자만. 휴지통 비우기(영구 삭제)는 일부러 만들지 않았어요.
4. **임시저장 서류는 월별 합계 · 신고 숫자에 넣지 않아요.**
5. **사용자가 정한 것:** 로그인은 매직링크 + 초대제, 우리 회사 정보는 설정 화면에서 입력(시드에 넣지 않음), 금액 글자의 EN/JA는 `฿ 64,200.00` 숫자, 양식 설정은 회사 전체 1개 · 관리자만, AI 모델 기본값 `claude-opus-5-5`, 한 번에 최대 5장, 양식 언어는 3개(한국어 양식 없음), 로그인은 기기마다 12시간 유지 후 보안 안내와 함께 재로그인, 화면 기본 언어는 일본어(한국어는 맨 끝), 화면은 밝은 모드 기본 (7-6)
6. **4개 언어 문구:** 새 문구는 `messages/`의 ko · th · en · ja **4개 파일 모두**에 넣어요 (`global.d.ts`가 ko 파일 기준으로 타입 검사).

---

## 7-1. 7단계 메모 (거래처 · 내보내기)

- **사용자가 정한 것:** 내보내기는 월별(몇월분) 단위, 형식은 엑셀(XLSX)과 PDF, 글자는 화면 언어(한국어 화면 → 영어) + 태국어 원문 칸, 거래처 사전은 자동 등록 + 자동 교정.
- **거래처 자동 등록:** DB 트리거 `documents_vendor`(마이그레이션 `…000200_vendors.sql`) — 판매자 세금번호 13자리로 `vendors`에 등록하고 `documents.vendor_id`를 연결. 처음 값이 기준이고 이후엔 빈 칸만 채워요. 이름은 거래처 화면에서 고칠 수 있어요.
- **자동 교정:** 올리기 대기열에서 AI 답을 받으면 `withVendor()`로 사전과 맞추고, 바뀐 칸을 "거래처 사전으로 맞췄어요: …"로 보여 줘요. 같은 세금번호라도 지점마다 주소가 달라서 **읽은 주소는 절대 덮어쓰지 않아요.**
- **PDF는 인쇄로:** `/ledger/report/2026-09`(A4 가로). PDF 라이브러리는 태국어 모음 · 성조 기호를 깨뜨리는 경우가 많아서, 브라우저 인쇄 → "PDF로 저장"을 써요. `?print=1`이면 열리자마자 인쇄 창이 떠요.
- **엑셀:** 1번 시트 = 서류 한 줄씩(+합계 줄), 2번 시트 = 품목 한 줄씩. 1행부터 표라 회계 프로그램에 가져오기 쉬워요. 필터를 켜 둬도 **그 달 전체**를 내보내요(임시저장 · 휴지통 제외).
- 로고 SVG는 인스턴스마다 그라데이션 id가 달라요(`useId`) — 같은 id를 쓰면 인쇄 때 숨겨진 헤더의 로고를 참조해서 색이 사라졌어요.

## 7-2. 8단계 메모 (대시보드)

- **첫 화면 = 대시보드** (`app/[locale]/(app)/page.tsx` → `components/dashboard/Dashboard.tsx`). 계산은 전부 `lib/dashboard.ts`(테스트 `dashboard.test.ts`) — 임시저장 · 휴지통은 빼요.
- **4칸:** 매입 합계 · 돌려받을 부가세(`claimable` = 필수 기재 사항 + 공제 기한까지 통과한 것만) · 미지급(외상 && 미지급, 기한 지난 건수) · 확인 필요. 우리 회사 세금번호가 없으면 부가세 칸이 설정으로 안내해요.
- **곧 지급할 청구서:** 기한 지남 → 7일 이내 → 나중 → 기한 없음 순. "지급 완료"는 `paid` + 오늘 날짜로 저장하고 알림의 되돌리기로 취소돼요. 변경 기록에도 남아요.
- **차트:** Recharts, 한 계열이라 범례 없음(제목이 이름), 고른 달만 진하게, 막대마다 툴팁, "표로 보기" 전환. 색은 `--primary`(대비 검사 통과).
- **기록:** `lib/activity.ts`가 `document_events` + 서류 + 직원 이름을 합쳐요. 트리거가 쓴 기록 중 사람이 없는 것(스크립트 · 시드)은 "시스템"으로 보여요.
- 검증: `work/check-step8.cjs`(프로젝트 밖) — 4칸 값, 지급 완료 → 되돌리기, 차트 6개 · 표, 달 바꾸기, 기록, 4개 언어, 휴대폰 가로 넘침 0, 다크.

## 7-3. LINE 봇 메모

- **사용자가 정한 것:** 1:1 채팅만, 설정 화면의 연결 코드로 **앱 계정과 연결한 사람만** 사용, 받은 영수증은 **바로 장부에**(임시저장 아님), 봇 답장은 **태국어 + 일본어 함께**.
- **흐름:** 사진 → 웹훅 `app/api/line/webhook/route.ts`(LINE 서명 확인 후 바로 200, 처리는 `after()`로 뒤에서) → `lib/line-bot.ts`: 연결된 직원인지 확인 → 같은 메시지 중복 전달이면 건너뜀(`line_messages`) → 1분 10장 제한 → "입력 중" 표시 → AI 읽기 → 거래처 사전 → 자동 확인(중복 포함) → 사진 저장 → `line_save_document`로 **그 직원 이름으로** 저장(기록 · 거래처 트리거 그대로) → 결과 카드.
- **답장:** 사진을 받자마자 "전송 중 · 완료되면 알림" 안내를 reply로 보내고(15초 안에 여러 장이면 한 번만), 결과 카드는 push로 보내요 — **사진 1장(묶음)마다 push 1건**이 LINE 월 무료 메시지 수(현재 500)에 들어가요. 묶음의 2번째 장부터는 자기 reply 토큰으로 무료 답장, reply가 실패하면 push로 대신 보내요.
- **LINE 기본 자동 응답**("메시지 감사합니다… 개별 회신 불가")은 앱이 아니라 공식 계정 설정이에요 — Official Account Manager → 설정 → 응답 설정에서 **응답 메시지 끄기**.
- **연결 화면(2026-09-26):** 설정 → LINE 연결에 **봇 친구 추가 QR**(`public/line-qr.svg`) + 3단계 안내(① QR 스캔 또는 [봇 친구 추가] ② [연결 코드 받기] ③ 코드를 LINE 채팅으로 보내기), 지금 할 단계는 초록 번호로 강조. QR은 사용자가 준 공식 계정 QR 이미지를 칸 단위로 다시 그린 SVG예요(위치 · 정렬 무늬 검사 통과) — 공식 계정을 바꾸면 Official Account Manager에서 새 QR을 받아 교체하세요. QR은 다크 모드에서도 흰 바탕이에요(스캔용).
- **연결:** 설정 → LINE 연결 → 6자리 코드(10분, 한 번만) → 봇에 보내기. 틀린 코드는 LINE 계정당 10분에 5번까지. 코드 표는 앱에서 읽을 수 없고, `line_user_id`는 봇만 넣을 수 있어요(직원은 해제만 가능) — `members_guard`.
- **DB:** 마이그레이션 `…20260926000000_line.sql` — `members.line_user_id`, `line_link_codes`, `line_messages`, 함수 `line_link_code()`(직원) · `line_link()` · `line_save_document()`(서버 전용).
- **문구 · 카드:** `lib/line.ts`(`say`, `receiptCard`). 카드의 "앱에서 열기" 링크에는 언어가 없어서, 여는 사람 브라우저 언어로 열려요.
- **검증:** `work/check-line.cjs`(프로젝트 밖) — 가짜 LINE 서버(3199)로 서명 · 연결 · 틀린 코드 · 코드 재사용 · 실제 AI 읽기 · push 대체 · 중복 전달 무시 · 링크 열기 · 연결 해제. 개발 서버를 `LINE_CHANNEL_SECRET=test-secret LINE_CHANNEL_ACCESS_TOKEN=test-token LINE_API_BASE_URL=http://127.0.0.1:3199 LINE_DATA_API_BASE_URL=http://127.0.0.1:3199`로 띄워야 해요.
- **실제로 켜기:**
  1. LINE Developers → Provider → **Messaging API 채널** 만들기
  2. Channel secret, Channel access token(long-lived)을 `.env.local`의 `LINE_CHANNEL_SECRET` · `LINE_CHANNEL_ACCESS_TOKEN`에 (채팅에 붙이지 말 것). 봇 ID(@…)는 `NEXT_PUBLIC_LINE_BOT_ID`, 앱 주소는 `NEXT_PUBLIC_APP_URL`
  3. Webhook URL = `https://<배포 주소>/api/line/webhook`, **Use webhook 켜기**, Verify. 로컬에서 해 보려면 cloudflared / ngrok 같은 HTTPS 터널이 필요해요
  4. LINE Official Account Manager → 응답 설정: **자동 응답 메시지 끄기**, 인사 메시지 끄기(봇이 대신 안내)
- **한계:** 요청 제한 · 틀린 코드 횟수는 서버 메모리라 서버가 여러 대면 공유되지 않아요. PDF 파일(전자 세금계산서)은 아직 받지 않아요(사진만).

## 7-4. 인쇄 · 보고서 · 속도 메모

- **서류 인쇄 = A4 한 장:** 인쇄 폭(약 700px)에서는 양식이 휴대폰 배치로 바뀌어 2~3장이 되고 서명이 잘렸어요. 이제 인쇄 때 PC 배치(860px)로 그린 뒤 페이지에 맞게 축소해요 — `components/invoice/print-fit.ts`(beforeprint에서 높이를 재서 zoom 계산, `html.print-fit`으로 print:hidden을 미리 숨겨 인쇄 높이로 측정). 넘치더라도 칸(서명 · 합계)은 통째로 넘어가요(`break-inside: avoid`). 검증: `work/check-print.cjs`.
- **서명 표시:** 인쇄 · 보기의 "서명 있음"은 양식 언어(มีลายเซ็น / Signed / 署名あり) — `signedTri()`. 화면의 토글 버튼만 화면 언어.
- **월별 PDF = 매입세액 보고서(รายงานภาษีซื้อ 양식):** 사업자(우리 회사 앞 서류의 고객 칸에서 이름 · 주소 · 지점), 과세 기간, 공제 대상 / 기타 매입(공제 불가) 구분, 소계 · 집계 · 미지급, 작성 · 검토 · 승인 서명란, 쪽 번호(@page 여백 상자). 흑백 문서 스타일, 머리글은 화면 언어 + 태국어 원문. 검증: `work/check-report.cjs`.
- **속도:** 첫 화면 484KB → 254KB (최대 5장 안내를 업로드 화면 파일에서 분리, 차트는 화면이 뜬 뒤 로드), 서류 화면 369KB → 355KB (사진 확대 뷰어 지연 로드).
- **배포 빌드:** `useSearchParams`를 쓰는 로그인 · 보고서에 Suspense를 둘러야 `next build`가 통과해요(전에는 실패했음). LINE 웹훅도 AI 지시문 파일을 배포에 포함(`next.config.ts`).
- **모바일:** 360~1920px × 한국어 · 태국어 × 8개 화면에서 가로 넘침 · 잘림 0, 휴대폰 터치 영역 40px 이상 — `work/check-responsive.cjs`.

- **장부 검색:** 거래처(3개 언어) · 문서번호 · 세금번호 · 품목 · 금액("64,200" / "64200")으로 찾기, 단어마다 모두 맞아야 함 — `search()` in `lib/archive.ts`.
- **"확인 필요" 표시:** 장부 목록에도 빨간 표시. 대시보드와 같은 규칙(`needsCheck()`), **중복(같은 서류 2번 저장)도 포함**.
- **지급 기한 LINE 알림:** `app/api/cron/due-reminders` — Vercel Cron(`vercel.json`, 매일 02:00 UTC = 방콕 09:00)이 `CRON_SECRET`으로 호출. 기한 지남 · 7일 이내 외상 매입이 있을 때만, LINE을 연결한 **관리자**에게 push(태국어 · 일본어). 없는 날은 안 보내요.
- **화면 폭 통일:** 대시보드 · 장부 · 거래처 · 설정 = max-w-5xl, 업로드 = 4xl, 서류 = 넓게.

## 7-5. 배포 (운영)

- **주소:** https://thai-receipt-ledger.vercel.app — Vercel 팀 `tladndus123-webs-projects`, 프로젝트 `thai-receipt-ledger`, 함수 지역 **sin1(싱가포르)** (`vercel.json`).
- **DB:** Supabase 프로젝트 **INC** (ap-southeast-1 싱가포르). 마이그레이션 4개 적용, pgTAP 27개 클라우드에서 통과. 가입 막음(초대제), Site URL · Redirect = 운영 주소.
- **다시 배포:** `npx vercel deploy --prod` (이 PC는 `vercel login` 되어 있음). DB 변경은 `npx supabase db push` (연결됨: `supabase link`). 배포 전 `npx next build`가 통과해야 해요.
- **키:** Vercel 프로젝트 Environment Variables(운영)에 9개 — Supabase URL · anon · service_role, ANTHROPIC_API_KEY, LINE 3개, CRON_SECRET, NEXT_PUBLIC_APP_URL. 로컬 배포용 키는 `.env.deploy`(git 제외). `.vercelignore`가 `.env*` 업로드를 막아요.
- **LINE:** 웹훅 = `https://thai-receipt-ledger.vercel.app/api/line/webhook`. 운영 DB는 새 DB라 **LINE 연결을 운영 사이트 설정에서 다시** 해야 해요.
- **알림:** Vercel Cron `0 2 * * *` → `/api/cron/due-reminders`.
- **메일:** Supabase Auth → Gmail SMTP(suhojayu4@gmail.com, 앱 비밀번호), 시간당 60통, 로그인 · 초대 메일 4개 언어 템플릿 — `scripts/email-templates.ts`, 적용은 `npx tsx scripts/setup-email.ts`(`.env.deploy`의 GMAIL_APP_PASSWORD 사용).
- **아직:** 도메인(예: ledger.회사.com)은 선택. Gmail 앱 비밀번호를 지우면 메일이 멈춰요.

- **멤버 관리 (설정 → 직원 관리, 관리자만):** 사람마다 초대 수락 전 / 마지막 로그인 / LINE 연결 표시. ⋯ 메뉴: **메일 보내기**(로그인 링크 = 초대 다시 보내기), **접근 해제**(사유 필수 · 프리셋 퇴사/부서 이동/잘못 초대). 해제된 사람은 아래 "접근 해제된 사람"에 날짜 · 해제한 사람 · 사유와 함께 남고 **다시 허용** 가능.
  - DB: `members.disabled_at / disabled_by / disable_reason`(마이그레이션 `…20260927000000_member_access.sql`). `is_member()` · `is_admin()`가 해제된 사람을 빼서 모든 표 · 사진이 즉시 닫힘. 관리자만, 자기 자신 불가, 마지막 관리자 불가, LINE 연결도 자동 해제.
  - 서버(`app/api/members` PATCH): 로그인 차단(ban) → 이미 로그인한 사람은 다음 화면에서 "접근이 해제되어 로그아웃됐어요"와 함께 로그아웃, 메일 링크로도 못 들어옴. 다시 초대하거나 "다시 허용"하면 복구.
  - 같은 마이그레이션에서 **서류 삭제 사유가 비어(null) 있어도 통과하던 구멍**도 막았어요.
  - 검증: `work/check-members.cjs`, pgTAP 35개.

## 7-6. 로그인 유지 · 언어 · 화면 모드 (2026-09-26)

- **로그인은 기기마다 12시간.** 로그인하면 그 기기(브라우저)에서 12시간 동안 유지돼요 — 브라우저를 껐다 켜도 그대로예요. 12시간이 지나면 그 기기만 로그아웃되고 로그인 화면에 "보안을 위해 … 다시 로그인해 주세요"(4개 언어)가 떠요. 다른 기기의 로그인은 그대로예요.
  - 시간의 기준 = 로그인한 순간. Supabase 토큰의 `amr`(로그인 방법 + 시각)은 토큰을 갱신해도 바뀌지 않아서, 사용 중에 시간이 늘어나지 않아요 (로컬에서 확인).
  - 코드: `lib/auth/session-limit.ts`(계산, 테스트 8개) · `lib/auth/session-guard.ts`(만료면 그 세션만 `signOut({ scope: "local" })`) — `middleware.ts`(화면 열 때), `/api/extract` · `/api/members`(서버), `components/auth/SessionWatch.tsx`(화면을 켜 둔 채 시간이 지날 때, 탭으로 돌아올 때 다시 확인). 로그인 화면 `?expired=1`에서 안내.
  - 시간을 바꾸려면 환경변수 `NEXT_PUBLIC_SESSION_HOURS`(기본 12, Vercel에 넣고 다시 배포).
  - 한계: 서버에서 강제로 끊는 기능(Supabase "Time-box user sessions")은 유료 요금제라 안 켰어요. 그래서 12시간이 지난 로그인은 다음에 화면을 열거나 서버 기능을 쓰는 순간 끊겨요.
- **화면 언어 기본 = 일본어.** 순서 日本語 · ไทย · English · 한국어(`i18n/routing.ts`). 처음 들어오면 브라우저 언어와 상관없이 일본어(미들웨어가 Accept-Language를 빼고 next-intl에 넘김), 고른 언어는 쿠키로 1년 기억.
- **화면 모드 기본 = 밝은 화면.** 예전엔 "기기 설정 따라가기"라 다크 모드 휴대폰에서는 다크만 보였어요. 이제 밝은 화면이 기본이고, 머리글 해/달 아이콘에서 다크 · 기기 설정을 고를 수 있어요(기기에 기억). 휴대폰 상단 바 색도 고른 모드를 따라가요(`components/layout/theme-color.tsx`). **주의:** React가 만든 `<meta>`를 코드로 직접 지우면 화면 이동 때 React가 멈춰요("removeChild" 오류 → 링크는 전체 새로고침, 버튼 이동은 반응 없음). 2026-09-26 첫 배포에서 실제로 이 문제로 모바일이 느려져서, 태그를 React가 그리게 고쳐 다시 배포했어요.
- **로그인 링크는 어느 브라우저에서나.** 예전 로그인 화면 링크는 PKCE라 **요청한 브라우저에서만** 열렸어요 — 휴대폰 메일 앱이 자기 브라우저로 열면 "링크가 만료됐거나 이미 사용됐어요". 이제 초대 메일처럼 implicit(`supabaseLinkSender`, `lib/supabase/client.ts`)이라 어느 브라우저 · 기기에서 열어도 로그인돼요 (로컬 재현 · 수정 확인, 운영에서 요청 방식 확인).
- **메일의 6자리 코드 (완료, 2026-09-26).** 링크가 다른 브라우저에서 열리면 그 브라우저에 로그인돼요. 쓰던 브라우저에 로그인하려면 로그인 화면의 코드 칸에 메일의 6자리 코드를 넣으면 돼요. 운영 메일 템플릿 · 코드 길이 6 · 보낸 사람 이름(Sawadee TAX)은 `npx tsx scripts/setup-email.ts`로 적용했고, 코드 칸은 `CODE_IN_EMAIL = true`(`components/auth/LoginForm.tsx`). Windows PowerShell에서 `npx`가 "스크립트를 실행할 수 없으므로"로 막히면 `npx.cmd`로 실행하세요(설정 변경 불필요). 로컬 Supabase 메일에는 코드가 없어요(기본 템플릿).
- **검증:** vitest 132개, 로컬 브라우저 확인(12시간 · 언어 15개, 로그인 링크 · 코드 · 밝은 화면 7개), 운영 확인 8개(메일 발송 없이). 확인 스크립트는 저장소 밖(작업 세션 임시 폴더)에 있어요.
- **배포:** 2026-09-26 04:20(+07) `npx vercel deploy --prod`. DB 변경 없음, 새 키 없음.

## 8. 알아 두면 좋은 것

**디자인**
- 애플풍: 배경 `#f5f5f7`, 카드 흰색, 포인트 시스템 블루(`--primary`), 애플 인텔리전스 그라데이션(`--ai-gradient`: 파랑→보라→분홍→주황)은 로고 · 합계 카드 · 자동 확인 · 올리기 칸에만 절제해서 써요.
- `globals.css`의 공용 클래스를 쓰면 모양이 맞아요: `.workspace-panel`(카드), `.ai-ring`(그라데이션 테두리), `.segmented-control`(iOS 토글), `.review-actions`(떠 있는 하단 버튼 바).
- 스타일 규칙을 레이어 밖(unlayered)에 쓰면 Tailwind 유틸리티(`hidden` 등)를 이겨 버려요. 실제로 `.nav-pill`의 `display:flex` 때문에 휴대폰에서 가로 넘침이 났어요 — display는 유틸리티로 주세요.
- 한국어는 `word-break: keep-all`(음절 중간에서 줄바꿈 안 함).
- 로고(2026-09-26, Sawadee TAX): 파란 타일 위 흰 세금계산서 + 노란 체크 — 사용자가 준 그림을 벡터로 다시 그린 `public/app-mark.svg`. `app/icon.svg`(브라우저 탭)는 같은 파일, `app/apple-icon.png`(180px, 모서리 없는 정사각형)는 이 그림에서 만든 것 — 로고를 바꾸면 셋을 함께 바꿔요. 주변의 파란 빛은 `APP_MARK_GLOW`(`components/layout/app-mark.tsx`, 다크 모드는 더 밝게). drop-shadow 두 개를 따로 쓰면 서로 덮어써서 `[filter:…]` 한 줄로 써요.

**양식 · 인쇄**
- 양식 칸 이름은 `useFormLabels()` / `FieldLabel`로 읽어요 (기본값 = `messages/{th,en,ja}.json`의 `labels.*`, 회사가 바꾼 값 = 양식 설정).
- 양식 내부 배치는 화면이 아니라 양식 너비 기준(`@container`)이에요.
- 인쇄: 화면 전용 요소에는 `print:hidden`을 붙여요. 서명 칸은 인쇄 때 점선 · 펜 아이콘 · 버튼이 빠지고 서명 글자만 실선 위에 나와요. "확인 필요" 배지도 숨겨져요.
- 흐린 칸: `unclear`의 칸 경로 + `fieldBoxes[경로]`가 있으면 배지를 눌렀을 때 사진이 그 위치로 확대돼요. 예시 서류의 `fieldBoxes`는 손으로 잰 임시 값이에요.

**AI 읽기 (`app/api/extract/route.ts`)**
- 지시문 = `docs/reference/extract-prompt.txt` 그대로 + `FIELD_BOX_RULE`(칸 위치). 배포 시 파일이 빠지지 않게 `next.config.ts`의 `outputFileTracingIncludes`에 넣어 뒀어요.
- 오류 코드(`rate` · `notDoc` · `badImage` · `aiFail` · `busy` · `noKey`)를 화면이 4개 언어 문장으로 바꿔요. 키가 없으면 SDK가 일반 `Error`를 던져서 메시지로 구분해요.
- 요청 제한은 **사람 기준** 메모리 카운터(1분 10회)라 서버(Vercel 함수)가 여러 개 뜨면 공유되지 않아요 — 엄격히 하려면 DB나 Redis로 옮기세요.

**장부**
- 몇월분 = **서류 날짜** 기준(`monthKey`). 표시는 `Intl`이라 태국어는 불기 연도(예: กันยายน 2569)로 나와요.
- 스티커는 7색 고정(`STICKERS`), 이름만 회사가 바꿔요.
- 삭제 애니메이션이 도는 동안 화면이 바뀌면 애니메이션이 끊겨요 — `StoredReview`의 `deleting` 상태가 그걸 막고 있어요.

**작업 환경**
- 이 폴더는 **git 저장소**예요 (2026-09-24 새로 시작, 원격 저장소 없음). 예전 원본 저장소 이력은 `review/git-log.txt`에만 있어요. 사용자가 요청할 때만 커밋해요.
- UI 작업 전 코드 백업: 이 폴더 바깥 `work/backup-before-ui-v2/` (app · components · lib · messages · 옛 favicon).
- 브라우저 확인 스크립트는 프로젝트 **바깥** `work/*.cjs`에 있어요 (`check-supabase-flow`, `check-step7`, `check-step8`, `check-line`, `check-print`, `check-report`, `check-responsive`, `check-members` 등 — 로컬 개발 서버 3130 + 로컬 Supabase + 설치된 Edge 기준, 결과 이미지는 `outputs/apple-ui-v2/`). 저장소 안 Playwright 테스트로 옮기면 좋아요.
- 커밋 메시지 끝에는 `Co-Authored-By` 줄을 붙여 왔어요 (선택).

### 거래처 아이콘 · 대시보드 글씨 (2026-09-27)
- 거래처마다 분류에 맞는 아이콘(lucide, 오픈소스 ISC): 거래처 규칙의 항목 → 없으면 그 거래처 서류에 가장 많이 쓴 항목 → 없으면 "기타"(`vendorCategory` in `lib/vendors.ts`, `components/vendors/CategoryIcon.tsx`). 거래처 화면과 대시보드 "곧 지급할 청구서"에 표시.
- 거래처 화면: 휴대폰에서 얇은 목록 한 줄(아이콘 · 이름 두 줄까지 · 금액 · 건수), 줄을 누르면 세금번호·이름 고치기·지우기·자동 등록 규칙이 펼쳐짐. 규칙이 있으면 이름 아래 요술봉 표시.
- 대시보드: 숫자를 키우고 이름표를 작게(글씨 크기 차이), "최근 기록" 5개, 청구서 줄은 이름·금액 한 줄 + 기한·버튼 한 줄. 거래처 줄은 휴대폰에서 금액이 이름 아래로.
- Figma(현재 화면 캡처): https://www.figma.com/design/SQKsCvrVFc4nQXB3s0q27O

### 배달앱 수수료 · 부가세 신고 알림 (2026-09-27)
- 매출 화면 "배달앱 수수료 (예상)": 앱별 주문 × GP 요율 + 수수료의 VAT 7% → 입금 예상(`lib/app-fees.ts`). 요율은 `company_settings.app_fees`(%, 관리자만 변경, 마이그레이션 20260927001000). 기본값 Grab·LINE MAN 30, foodpanda 32, ShopeeFood 25, Robinhood 0. "이번 달 결과"에 "배달앱 수수료까지 빼면" 한 줄(수수료 VAT 제외 — 앱 세금계산서로 공제 가정).
- 부가세 신고 알림: 매일 크론(`/api/cron/due-reminders`)이 신고 기한 3일 전·1일 전, 달이 안 닫혔을 때만 LINE 연결한 관리자에게 태국어+일본어로 보냄(확인 필요·임시저장 건수, 공제 가능 VAT). `vatReminder` in `lib/line.ts`.

### 항목별 손익표 (2026-09-28)
- 매출 화면 → "항목별 손익표" (`/sales/pl`): 3·6·12개월을 나란히, 매출은 판매 경로별, 비용은 항목별(큰 것부터), 이익. 계산은 "이번 달 결과"와 같음(`lib/pl-table.ts`, 테스트로 일치 확인). 휴대폰은 옆으로 밀기(항목 이름 고정, 처음엔 최근 달이 보이게). 엑셀 받기(`lib/pl-xlsx.ts`).

### LINE 알림 수정 · 시험 발송 (2026-09-28)
- 지급 알림이 "외상"만 보던 버그 수정: 이제 대시보드와 같은 규칙(지급 완료 체크 안 된 모든 서류, 기한 7일 이내·지남). 알림 내용은 `lib/reminders-server.ts` 한 곳에서 만들고 크론과 시험 발송이 같이 씀.
- 설정 → LINE(연결된 관리자만): "알림 시험 보내기" → 누른 사람 LINE으로만, 부가세 알림은 날짜 상관없이(`/api/line/test-reminder`, 10분에 3번).

### 휴대폰 화면 정리 · 대시보드 이익 (2026-09-28)
- 장부 줄: 이름과 금액 한 줄(금액은 안 잘림), "문제 없음으로 표시"는 휴대폰에서 아래 줄로.
- 서류 화면 기록: 5개만, "N개 더 보기". 사진 올리기: 올리기 칸이 맨 위(안내 카드는 아래, 사진을 올리면 숨김), 휴대폰 문구 "서류 사진을 고르거나 찍으세요".
- 대시보드 맨 위 "이번 달 남은 돈 (이익)" 줄(매출 화면과 같은 계산, 누르면 매출로). 매출이 없으면 입력 안내. "곧 지급할 청구서" 설명을 새 규칙(지급 완료 안 한 모든 청구서)에 맞춤.

### 홈 화면 앱 설치 (2026-09-28)
- `app/manifest.ts`(standalone, 아이콘 `public/icons/*` ← `node scripts/make-app-icons.mjs`, 길게 누르면 "사진 올리기" 바로가기), iPhone용 `appleWebApp` 메타, `viewportFit: cover`(아래 탭 막대가 홈 표시줄 위로).
- 설치 안내: 설정 → "휴대폰에 앱으로 설치"(안드로이드 Chrome은 설치 버튼, iPhone은 공유 → 홈 화면에 추가 2단계, 그 외 브라우저 메뉴 안내). 대시보드에 휴대폰에서만 닫을 수 있는 안내 줄(설치됐거나 닫으면 안 보임, `lib/install-app.ts`).

### 공휴일 · 직원별 작업 · 여러 영수증 · 휴대폰 알림 (2026-09-28)
- **신고 마감일 공휴일 반영**: 15일·23일이 주말·태국 공휴일이면 다음 영업일(`lib/thai-holidays.ts`, 2026·2027 목록). 예: 9월분 인터넷 신고 23/10/2026(쭐랄롱꼰 기념일) → 26/10. ⚠ **매년 가을 다음 해 공휴일을 추가**해야 함(목록이 끝난 해는 주말만 건너뜀).
- **직원별 작업**(대시보드, 관리자만): 이 달 사람별 올림·고친 서류 수·문제 없음·삭제/복구(`lib/team-summary.ts`, document_events + ack 도장).
- **한 장에 여러 영수증**(연속 촬영 "여러 장", 최대 6장): 작은 사본(1024px)으로 위치만 찾고(`/api/split`, `lib/split-server.ts`, 읽기 모델을 effort low로 — Haiku 4.5는 3장 중 2장·칸 틀림, Sonnet 5는 느슨, Opus가 정확, 2026-09-28 시험), 휴대폰이 원본 해상도로 잘라 평소처럼 읽음(`cutOut` 표시 → 옆 영수증 무시 안내). 시험: 3장 모두 정확, 영수증 1장당 입력 토큰 −26%, 위치 찾기(사진당 ~960/80 토큰) 포함해도 장당 약 9% 저렴. 읽기 규칙 글(~2천 토큰)은 Opus 캐시 최소 길이보다 짧아 캐시 효과 없음.
- **휴대폰 알림(웹 푸시)**: 설정 → "휴대폰 알림"(관리자). `public/sw.js`(알림만, 캐시 없음), `push_subscriptions`(본인 기기만, 마이그레이션 20260928000000), 매일 크론이 LINE과 같은 내용을 관리자 기기로도 보냄, 시험 버튼 `/api/push/test`. 키: Vercel env `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`(로컬 `.env.local`에도). 아이폰은 홈 화면 앱에서만. 로컬 PC에서 Node가 WNS 연결 시간 초과(자동 IPv4/6 선택 250ms) — Vercel에서는 문제 없음, 로컬 시험은 `net.setDefaultAutoSelectFamilyAttemptTimeout(3000)`.

### 지점(สาขา)별 장부 (2026-09-28)
- 한 회사(세금번호 하나)에 가게 6곳: `public.branches`(번호 5자리 `no`, 이름, 관리자만 변경, 본점 `00000`은 삭제 불가), `documents.branch_id`·`sales.branch_id`(기본 본점 `head_branch()`, 매출은 지점·날짜·경로별 1줄). 마이그레이션 20260928000100. 기존 데이터는 모두 본점.
- 서류의 지점 결정 순서(`lib/branches.ts assignBranch`): 이미 있는 지점 → 사진의 구매자 지점 번호(สาขาที่ 0000x)가 등록된 지점과 맞으면 그 지점 → 화면 위에서 고른 지점 → 본점. 업로드·직접 입력·LINE 모두 같음.
- 화면 위 지점 선택(`components/layout/branch-switcher.tsx`, 지점이 2개 이상일 때만): 장부·매출·부가세 카드·보고서·손익표가 고른 지점만(`useLedger()`/`useSales()`가 걸러 줌; `{all:true}`는 전체). 선택은 기기에 저장(`trl.branch`). 보고서 머리글의 사업장은 고른 지점 번호.
- 대시보드 "지점별 이번 달"(전체 지점 볼 때): 지점마다 매출·비용·남은 돈·낼 부가세 + 합계.
- 설정 → "지점 관리"(관리자): 번호·이름 추가·수정·삭제(서류 있는 지점은 DB가 거부). 서류 화면·매출 입력·POS 엑셀에 지점 고르기.
- LINE: 사진에 지점 번호가 없고 지점이 2개 이상이면 영수증 카드 아래 지점 버튼(quick reply postback `branch=<id>&doc=<id>`) → `pickBranch`가 `branch_id` 갱신. 달 마감은 회사 전체 기준 그대로.

### 항목 추가 · 품목별 항목 · 감가상각 (2026-09-28)
- 항목에 **소모품(consumables)·수리비(repairs)·설비 구입(asset)** 추가(`lib/types.ts CATEGORIES`, 읽기 규칙 글, 아이콘, 4개 언어). 항목 목록은 코드가 기준이고 DB는 글자만 보관.
- **품목별 항목**: `Item.category`("" = 서류와 같음, `document_items.category`). 서류 고치기의 품목 표에 항목 칸, 보기 표에는 다른 줄만 칩으로. AI는 섞인 전표일 때만 줄마다 항목을 줌. 비용은 줄 금액 비율로 나눔(`lib/cost-split.ts costByCategory`, 반올림 차이는 가장 큰 줄에).
- **감가상각**: 항목이 "설비 구입"일 때 상각 기간 칩(0·3·5·10·20년, `documents.dep_years`, `components/invoice/DepYears.tsx`). 계산서 달부터 매달 정액(`depreciationFor`, 마지막 달이 나머지). 그 달 비용에서 설비 자체는 빠지고 감가상각비가 들어감 — "이번 달 결과"·대시보드 이익·지점별 표(`monthResult`)와 손익표("감가상각비" 줄, `plTable`) 모두 `monthCosts` 한 곳을 씀. 부가세 공제는 산 달 그대로. 마이그레이션 20260928000200.

### 지점 전환 (인스타 부계정 방식) · 통합 메인보드 (2026-09-28)
- 결정(사장님): 관리자·직원 모두 전체 지점을 봄(직원 제한은 나중에), 앱은 마지막에 보던 지점으로 시작, 지점 색은 자동 + 관리자 변경.
- 화면 위 지점 버튼(색 동그라미 + 이름) → 아래에서 올라오는 "지점 전환" 창: "통합 · 전체 지점"과 각 지점, 이번 달 매출·남은 돈, 지금 보는 곳 ✓. 지점을 고르면 화면 위 막대 아래에 그 지점 색 줄(`components/layout/branch-switcher.tsx`).
- 통합일 때 대시보드: "통합 · 지점 N곳" 합계 카드(매출·비용·남은 돈·낼 부가세) + 지점별 카드(누르면 그 지점으로 전환, `components/dashboard/BranchTable.tsx`, 계산 `lib/branches.ts branchSummaries` = `monthResult`와 같음; 지점 없는 옛 행은 본점으로). 이때 단독 "이번 달 남은 돈" 줄은 숨김.
- 통합일 때 장부: 서류마다 지점 이름표(색). 설정 → 지점 관리: 색 8가지 고르기(`branches.color`, ''=자동, 마이그레이션 20260928000300).
- 주의: 여러 행을 한 번에 insert할 때 일부 행에만 color를 넣으면 PostgREST가 나머지 행에 null을 보내 not-null 위반 — 앱은 한 행씩 저장하고 항상 color를 보냄.

### 안정성: 보고서 품목별 항목 · 설비 목록/처분 · 여러 건 항목 바꾸기 · 중복 사진 (2026-09-28)
- **엑셀**: 품목 시트에 줄마다 항목(줄 항목 없으면 서류 항목), 새 시트 "항목별 비용"(`monthCosts` — 손익표와 같은 숫자, 감가상각비·설비 처분 포함).
- **설비 목록** `/ledger/assets`(장부 위 "설비 목록 N" 링크): 산 금액·비용 처리됨·남은 금액·매달·끝나는 달·상태. "처분 표시" → `documents.disposed_on`(마이그레이션 20260928000400): 그달부터 상각 멈춤, 남은 금액을 그달 비용으로(`disposalFor`, 손익표 "설비 처분" 줄). 처분일은 처분 달(이전·이후 모두)이 마감 전일 때만 DB가 허용, 산 달이 마감돼도 처분 표시는 가능, 상각 기간은 마감되면 못 바꿈. 판 돈은 매출로 따로.
- **여러 건 항목 바꾸기**(장부 → "여러 건 항목 바꾸기"): 마감한 달 서류는 체크 불가, 품목별 항목은 그대로(`setCategoryMany`).
- **중복 사진**: 사진 지문 dHash 64bit(`lib/photo-hash.ts`, 서버는 sharp `photo-hash-server.ts`, 8비트 이내 = 같은 사진). 업로드 시 AI 전에 장부(임시저장 포함, 휴지통 제외)·이번 목록과 비교 → "이미 올린 사진 같아요" + 빼기/그래도 읽기/보기. LINE도 같은 사진이면 읽지 않고 링크로 답. 저장 때 `documents.photo_hash`(마이그레이션 20260928000500, 마감 달에도 채울 수 있는 칸). 예전 서류는 `scripts/backfill-photo-hash.ts [--cloud]`로 채움(2026-09-28 로컬·클라우드 실행). 휴대폰(canvas)과 서버(sharp) 지문이 서로 맞는 것 브라우저로 확인.
- 휴대폰: 사진 목록에서 확인 버튼이 여러 개일 때 아래 줄로(글자가 세로로 깨지던 문제).

### 분류 관리 · 품목 줄 편집 · 비고 (2026-09-28)
- **분류 관리**(설정 → 분류 관리, 관리자): `public.categories`(마이그레이션 20260928000700). 기본 12개는 이름 변경·숨기기(삭제 불가, "기타"는 숨김 불가), 회사 분류 추가(key `c_` + 6자). 이름은 화면 언어로 쓰면 저장 때 ko·th·en·ja 자동 번역(`/api/translate/label`, 관리자, `translateLabel`), 직접 수정 가능. AI 설명(hint), 아이콘·색, "부가세 공제 안 됨"(접대비는 항상). 서류·품목·거래처 규칙이 쓰는 분류는 DB가 삭제 거부 → 숨기기. 문서의 `category`는 글자 그대로라 기존 데이터 영향 없음.
  - 코드: 분류 키 = 기본(`CATEGORIES`) 또는 `c_…`(`isCategoryKey`). 이름·목록은 `useCategoryLabel()`/`useCategoryOptions()`(`components/vendors/CategoryIcon.tsx`), 아이콘·색 `lookOf`. AI 읽기 규칙에 회사 분류·숨긴 분류 추가(`lib/category-prompt.ts`, 서버 `categories-server.ts` 1분 캐시). 공제 불가 분류는 `setBlockedCategories`(클라이언트 스토어·서버 둘 다 설정).
- **품목 줄 편집**(간단히 화면 "품목 N줄"): 추가·수정·삭제, 수량×단가→금액, 줄마다 분류(`components/invoice/QuickItems.tsx`). 한 언어로 쓰면 저장 때 번역.
- **비고**(`documents.memo`, 마이그레이션 20260928000600): AI 메모와 별개, 간단히 화면과 자세히 화면(메모 아래) — 저장된 서류는 칸을 벗어나면 바로 저장, 마감한 달도 가능. 장부 검색에 포함.
- 참고: 클라우드 DB 테스트는 실제 값에 기대지 않게(지점 번호 09991, 수수료 요율 전후 비교) — 운영 중 지점·요율이 이미 설정돼 있음.

### 원가 관리 · 인건비 · 지급수수료 · 배달앱 이름 (2026-09-28)
- 피드백(식당 3대 비용). 결정(사장님): 인건비는 태국식으로 달마다 직접 입력, 식재료는 분류 설정에서 고름, 카드 수수료는 분류만, 목표 30/30/10.
- **원가 관리 카드**(매출 화면, `components/sales/CostCard.tsx`, 계산 `lib/cost-control.ts`): 식재료(분류 관리 "식재료 원가에 포함" — `categories.food_cost`, 처음 식비·재료상품) · 인건비 · 임대료(분류 rent) · 합계를 매출(부가세 제외) 대비 %, 목표 이하 초록 / +5%p까지 주황 / 넘으면 빨강. 목표는 `company_settings.cost_targets`(관리자). 재고 반영 없음(매입은 계산서 날짜 기준).
- **인건비** `public.labor_costs`(지점·달 1줄: 급여·수당, 사회보험 회사 부담, 기타, 메모; 관리자만 입력, 마감 달 동결; `lib/labor-store.ts`). `monthResult(…, labor)`로 "남은 돈"에서 빠지고(대시보드·지점별·매출), 손익표에 "인건비" 줄. 직원 원천세(ภ.ง.ด.1)는 넣지 않음.
- **지급수수료** 기본 분류 `fees`(ค่าธรรมเนียม, 카드·은행 수수료, 아이콘 카드) — AI 읽기 규칙에도 추가.
- **배달앱 이름 바꾸기**: 배달앱 수수료 카드 "요율 바꾸기"에서 앱 이름도(`company_settings.channel_names`, `useChannelLabel`) — 매출 화면·입력·POS 엑셀·손익표·매출세 보고서("ขายผ่าน <이름>")에 반영. 마이그레이션 20260928000800.

- 대시보드 "곧 지급할 청구서": 처음 5건, "N건 더 보기"/"접기", 제목 옆 건수 배지와 오른쪽 합계 (2026-09-28).

- 매출 화면 날짜 목록: 처음 10건, "N건 더 보기"(20건씩)/"접기", 달 바꾸면 다시 10건 (2026-09-28, 그리는 줄 수를 줄여 빠르게).

### 급여 (태국 기준, 2026-09-28)
- 메뉴(계정 버튼) → **급여**, 관리자만(`/payroll`). 탭: 급여 계산 · 직원 · 신고 서류. DB `public.employees`, `public.payroll_lines`(관리자만 RLS, 마감 달 동결), `company_settings.payroll_settings`(사회보험 요율 5%·1,650~17,500, 화면에서 수정). 마이그레이션 20260928000900.
- 계산 `lib/payroll.ts`(테스트 있음): 월급/일당, 1~15일분은 15일·16일~말일분은 말일 지급, 연장 ×1.5 · 휴일 ×1(월급)/×2(일당) · 휴일연장 ×3(시급 = 월급÷30÷8 또는 일당÷8). 사회보험·원천징수세(ภ.ง.ด.1 월할 방식: 연환산−경비 50%(최대 10만)−본인 6만−사회보험−추가공제, 누진세율 ÷12, 보너스는 그 달 추가세)는 말일 지급분에서 공제. 직원별로 원천세 직접 지정 가능.
- 저장(`savePayrollMonth`): 직원·기간별 2줄(당시 급여형태·금액도 저장 → 나중에 월급이 바뀌어도 명세서 그대로) + 지점별 인건비(급여 합계 + 회사 사회보험)를 `labor_costs`에 자동 기록("기타"는 유지).
- 인쇄 `/payroll/print/{slip|pnd1|sso}/{YYYY-MM}`: 급여명세서(태국어+영어, 주민번호 끝 4자리), ใบแนบ ภ.ง.ด.1, สปส.1-10 ส่วนที่ 2(전체 주민번호 — 신고용).
- 마감: ภ.ง.ด.1 종이 다음 달 7일 / 온라인·สปส.1-10 15일(주말·공휴일이면 다음 영업일, `payrollFiling`). LINE·푸시 알림 3일·1일 전(그 달 급여가 저장돼 있고 마감 안 된 경우).
- 나중에: 연간 ภ.ง.ด.1ก, 직원용 50 ทวิ, 근태 연동, 직원 지점 제한.
- 급여 보완 (2026-09-28): 그 달 지급액 0원인 직원(일한 날 없는 일당)은 신고 목록·명세서·인원에서 뺌. 월급 직원이 달 중간 입사/퇴사면 근무 안 한 날을 무급 결근으로 미리 채움(`daysNotEmployed`, 직접 고칠 수 있음). 사회보험 사업장 번호(10자리)를 신고 서류 탭 요율 카드에서 저장 → สปส.1-10 머리에 인쇄(`payroll_settings.ssAccount`).
- 메뉴에 **급여** 탭 (관리자만, 2026-09-29): PC 위 메뉴 "거래처"와 "설정" 사이. 휴대폰 아래 탭은 관리자면 6칸이라 옆으로 밀어서 넘김(한 칸 18.5% → 6번째가 살짝 보임, 현재 탭이 보이게 자동 스크롤). 직원은 기존 5칸 그대로. 태블릿 폭(1100px 미만) 위 메뉴는 현재 탭만 이름, 나머지는 아이콘(마우스 올리면 이름). 계정 버튼 안 "급여"는 뺌.
- **FLR 중심 대시보드** (피드백 반영, 2026-09-29): 대시보드 "남은 돈" 바로 아래에 원가 관리 카드(매출 화면에도 그대로). 위에 큰 숫자 **FL**(식재료+인건비)·**FLR**(+임대료) %, 아래 F·L·R 막대. 목표는 F·L·R 목표의 합(기본 60%·70%, `costControl` → `fl`/`flr`, 예전 `prime` 없앰). F는 '식재료 원가에 포함' 분류만(오너 결정). 부가세 카드는 청구서·추이 아래로 내림. 지점 여러 개일 때 통합 보드·지점 카드의 네 번째 칸이 "낼 부가세" → "FL / FLR"(`branchSummaries` 행에 `costs`·`labor` 추가).
