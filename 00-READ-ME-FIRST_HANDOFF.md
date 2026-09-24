<!-- docs/HANDOFF.md 사본 (링크만 루트 기준). 고칠 때는 docs/HANDOFF.md를 고치고 다시 복사하세요. -->
# 인수인계서 — 태국 세금계산서 · 영수증 장부 (Thai Receipt Ledger)

> 이 프로젝트를 이어받는 개발자(AI 포함)를 위한 문서예요. **UI를 포함해 자유롭게 바꿔도 됩니다.**
> 다만 아래 "지켜 주세요"(7번)는 회계 정확도 · 데이터 보존과 관련이 있으니 유지해 주세요.
>
> - 원래 지시서: [`docs/PROMPT.md`](docs/PROMPT.md) (전체 요구사항, 9단계 진행 순서)
> - 기준 시제품: [`docs/reference/prototype-ledger.html`](docs/reference/prototype-ledger.html)
> - 4단계까지의 상세 기록: [`docs/REVIEW.md`](docs/REVIEW.md) (설계 결정, 시제품과 다르게 한 것)
> - 외부 검수 결과 (9건 모두 수정됨): [`docs/review-findings/REVIEW-FINDINGS.md`](docs/review-findings/REVIEW-FINDINGS.md)
> - 작성 2026-09-24 · 같은 날 UI · 올리기 · 장부 작업 후 갱신

---

## 1. 한눈에 보기

태국 회사 직원들이 세금계산서 · 영수증 **사진을 올리면 → AI가 읽고 → 원본과 같은 배치로 태국어 · 영어 · 일본어 양식을 만들고 → 계산을 자동 확인해서 → 장부에 저장**하는 웹앱이에요.

- 사용자: 회사 직원 여러 명 (관리자 + 일반 직원). 우리 회사는 주로 **구매자** 쪽이에요.
- 모바일 우선 (휴대폰 · 컴퓨터 모두). 휴대폰은 하단 탭 바, 컴퓨터는 상단 알약 메뉴.
- 화면 언어 4개: 한국어 · 태국어 · 영어 · 일본어 / **양식 언어 3개: 태국어 · 영어 · 일본어** (한국어 양식은 사용자가 원하지 않아 되돌렸어요 — 한국어는 화면에만)

**지금 된 것**
- 계산 규칙과 테스트(외부 검수 결함 9건 수정 포함), 정리된 양식(보기 / 고치기 / 인쇄), 양식 설정
- 애플 인텔리전스풍 UI (라이트 · 다크), 로고 · 파비콘
- 사진 올리기: **한 번에 최대 5장 동시 AI 읽기** + `/api/extract` (실제 키로 확인 완료 · 정확도 평가 스크립트 있음 — 5번 ②)
- 서명: 보기 화면에서 직접 타이핑 또는 "서명 있음" 표시, 인쇄 시 편집 표시 숨김
- 장부: **월별 보관함("2026년 9월분")**, 색 스티커 7종 + 필터, **임시저장**, 관리자만 삭제 · **삭제 사유 필수 · 휴지통(소프트 삭제) · 복원**, 분쇄기 애니메이션
- 설정: 내 권한(관리자/직원, 임시), 스티커 이름, 양식 설정

**아직인 것:** DB · 로그인 · 실제 권한 보안 · 거래처 · 대시보드 요약 · 내보내기 · 정확도 평가 스크립트 (5번)

> ⚠️ 장부 · 권한 · 스티커 이름 · 양식 설정은 모두 **이 브라우저에만 저장되는 임시 구현**이에요. 6번을 먼저 읽어 주세요.

---

## 2. 실행 방법

```bash
npm install
npm run dev -- -p 3100      # http://localhost:3100/ko
npm test                    # Vitest 89개 (lib/**/*.test.ts)
npm run eval:extract        # AI 정확도 평가 (.env.local의 ANTHROPIC_API_KEY 필요, 유료 호출 1회)
npx tsc --noEmit            # .next/types 관련 TS6053은 오래된 빌드 캐시 — 무시하거나 .next 삭제
npx eslint app components lib
```

- Node 24에서 개발했어요.
- **AI 읽기**를 쓰려면 `.env.local`에 `ANTHROPIC_API_KEY`를 넣고 서버를 다시 켜요. 없으면 올리기 화면에 "AI 연결 키가 없어요" 안내가 떠요. 나머지 변수는 `.env.example` 참고.
- 주요 화면

| 경로 | 화면 |
|---|---|
| `/ko` | 홈 (사진 올리기 · 예시 서류 · 양식 설정 입구) |
| `/ko/upload` | 사진 올리기 (최대 5장 동시 읽기 → 확인 → 저장 / 임시저장) |
| `/ko/documents/sample` | 예시 서류 (저장하면 장부에 사본이 들어가요) |
| `/ko/documents/<uuid>` | 장부에 저장된 서류 |
| `/ko/ledger` | 장부: 월별 보관함 · 임시저장 · 휴지통(관리자) |
| `/ko/settings` | 내 권한(임시) · 스티커 이름 · 양식 설정 |

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
| AI | `@anthropic-ai/sdk` — `messages.create`, 프롬프트로 JSON → zod 검사 → `normalize()` | 모델 `claude-opus-5-5`(기본), effort `medium`(기본). 읽기 코드 `lib/extract-server.ts` |
| 사진 | browser-image-compression · heic2any · react-zoom-pan-pinch | 올리기 전 방향 보정 · 아이폰 HEIC → JPG · 축소 |
| 임시 저장소 | IndexedDB(장부 · 사진) · localStorage(설정류) | 5단계에서 Supabase로 교체 (6번) |
| 테스트 | Vitest | Playwright는 설치돼 있지만 프로젝트 안에 테스트는 아직 없어요 (8번 참고) |
| 설치만 됨 | @supabase/ssr, exceljs, @tanstack/react-table | 5 · 7단계용 |

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
  form-labels.ts / form-config.ts      양식 칸 이름 · 양식 설정
  ── 임시 저장소 (5단계에서 교체) ──
  ledger-store.ts      장부 · 사진 (IndexedDB), 임시저장 상태, 소프트 삭제 · 복원
  upload-queue.ts      올리기 대기열 (메모리)
  role-store.ts        내 권한 · 이름 (localStorage)
  sticker-store.ts     스티커 이름 · 색 (localStorage)
  form-config-store.ts 양식 설정 (localStorage)

messages/        화면 문구 4개 언어. labels.*는 양식 칸 이름(th/en/ja 파일이 양식에 쓰임)
docs/            지시서, 참고 파일, 검수 · 인수인계 문서, review-findings/(외부 검수 결과)
```

**데이터 흐름:** 사진(최대 5장) → 브라우저에서 정리(HEIC 변환 · 방향 · 축소) → `/api/extract`에서 Claude가 JSON으로 읽음(zod로 모양 검사) → `normalize()` → 올리기 화면 목록 → 확인하기(`DocumentReview`) → **장부에 저장**(final) 또는 **임시저장**(draft) → 장부(월별 보관함)

---

## 5. 남은 일 — 이 순서를 추천해요

### ① 외부 검수 결함 9건 — ✅ 모두 수정 (2026-09-24)

상세: [`docs/review-findings/REVIEW-FINDINGS.md`](docs/review-findings/REVIEW-FINDINGS.md). 회귀 테스트는 `lib/review-fixes.test.ts`(번호별 describe)에 있어요.

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

### ③ 5단계: Supabase (DB · 로그인 · 권한)

지시서 5번 스키마에 더해, 이번 작업으로 **추가로 필요한 것**:

| 대상 | 추가할 것 | 지금 있는 곳 |
|---|---|---|
| documents | `status text check (status in ('draft','final'))` | `LedgerEntry.status` |
| documents | `deleted_at timestamptz`, `deleted_by uuid`, `delete_reason text not null when deleted` | `LedgerEntry.deletedAt/By/deleteReason` |
| documents (doc jsonb) | `stickers`, `signs.receiverSign / issuerSign / delivererSign` | `LedgerDoc` |
| company_settings | `form_config jsonb`, `sticker_names jsonb` | localStorage |
| company_members | `role` (admin / staff) | `role-store.ts` (누구나 바꿀 수 있음) |

- **RLS 필수:** 삭제(= `deleted_at` 설정) · 복원 · 휴지통 조회는 admin만. 목록 조회는 기본으로 `deleted_at is null`.
- 월별 합계는 `status = 'final'`만.
- 교체 방법: 각 `*-store.ts`의 함수 이름(`useLedger`, `saveEntry`, `softDelete`, `restoreEntry`, `useMe` …)을 그대로 두고 안쪽만 Supabase로 바꾸면 화면은 거의 안 고쳐도 돼요.

### ④ 그다음 (지시서 7~9단계)

| 단계 | 남은 것 | 이미 된 것 |
|---|---|---|
| 7 | 거래처 사전, 지급 관리 화면, CSV(BOM) · XLSX · 3개 언어 PDF | 장부 목록(월별), 인쇄 |
| 8 | 대시보드 요약(4칸 · 곧 낼 청구서 · 6개월 차트), 우리 회사 세금번호 설정, 기록 | 권한 UI(임시) |
| 9 | Playwright 테스트를 프로젝트에 넣기, README 작성(지금은 create-next-app 기본), Vercel 배포 | 휴대폰 · 다크 · 가로 넘침 점검 |

### 제안만 된 것 (사용자와 합의 전)

- 월 마감 잠금(신고한 달은 수정 · 삭제 불가), 원본 종이 보관 위치 칸, 보관 기간(보통 5년 — 회계사 확인 필요) 표시, 캘린더(지급 기한 · 신고 마감일)

---

## 6. 임시 구현 — 꼭 알아 두세요

| 무엇 | 어디에 | 키 / 이름 | 한계 |
|---|---|---|---|
| 장부 · 사진 | IndexedDB | DB `trl-ledger`, store `docs` | 이 브라우저에만. 다른 기기 · 브라우저에서 안 보임 |
| 올리기 대기열 | 메모리 | `upload-queue.ts` | 새로고침하면 사라짐 (저장 · 임시저장한 것만 남음) |
| 내 권한 · 이름 | localStorage | `trl.me` | **보안 아님.** 누구나 설정에서 관리자로 바꿀 수 있음 |
| 스티커 이름 | localStorage | `trl.stickerNames` | |
| 양식 설정 | localStorage | `trl.formConfig` | |
| 양식 언어 선택 | localStorage | `trl.formMode` | 이건 개인 설정이라 그대로 둬도 됨 |

- 탭 여러 개 사이 동기화는 `BroadcastChannel` · `storage` 이벤트로 해요.
- 예시 서류(`/documents/sample`)는 장부와 별개예요. 저장 · 임시저장하면 **사본**이 장부에 들어가고, 예시 서류를 삭제하면 실제로는 지우지 않아요.

---

## 7. 지켜 주세요

1. **`lib/`의 계산 결과를 바꾸지 마세요.** 바꿔야 한다면 테스트를 먼저 고치고 `npm test`가 통과해야 해요. 돈 계산은 사탕 정수로 해요 (월별 합계도 `archive.ts`에서 사탕으로 더해요).
2. **API 키는 서버에서만** 써요 (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). `.env*`는 git에 올리지 않아요 (`.gitignore`에 있음).
3. **서류는 영구 삭제하지 않아요.** 삭제 = 소프트 삭제 + 사유 필수 + 관리자만. 휴지통 비우기(영구 삭제)는 일부러 만들지 않았어요.
4. **임시저장 서류는 월별 합계 · 신고 숫자에 넣지 않아요.**
5. **사용자가 정한 것:** 로그인은 매직링크 + 초대제, 우리 회사 정보는 설정 화면에서 입력(시드에 넣지 않음), 금액 글자의 EN/JA는 `฿ 64,200.00` 숫자, 양식 설정은 회사 전체 1개 · 관리자만, AI 모델 기본값 `claude-opus-5-5`, 한 번에 최대 5장, 양식 언어는 3개(한국어 양식 없음)
6. **4개 언어 문구:** 새 문구는 `messages/`의 ko · th · en · ja **4개 파일 모두**에 넣어요 (`global.d.ts`가 ko 파일 기준으로 타입 검사).

---

## 8. 알아 두면 좋은 것

**디자인**
- 애플풍: 배경 `#f5f5f7`, 카드 흰색, 포인트 시스템 블루(`--primary`), 애플 인텔리전스 그라데이션(`--ai-gradient`: 파랑→보라→분홍→주황)은 로고 · 합계 카드 · 자동 확인 · 올리기 칸에만 절제해서 써요.
- `globals.css`의 공용 클래스를 쓰면 모양이 맞아요: `.workspace-panel`(카드), `.ai-ring`(그라데이션 테두리), `.segmented-control`(iOS 토글), `.review-actions`(떠 있는 하단 버튼 바).
- 스타일 규칙을 레이어 밖(unlayered)에 쓰면 Tailwind 유틸리티(`hidden` 등)를 이겨 버려요. 실제로 `.nav-pill`의 `display:flex` 때문에 휴대폰에서 가로 넘침이 났어요 — display는 유틸리티로 주세요.
- 한국어는 `word-break: keep-all`(음절 중간에서 줄바꿈 안 함).
- 로고를 바꾸면 `app/icon.svg`, `app/apple-icon.png`도 다시 만들어야 해요 (지금은 `app-mark.tsx`를 렌더링해서 만들었어요).

**양식 · 인쇄**
- 양식 칸 이름은 `useFormLabels()` / `FieldLabel`로 읽어요 (기본값 = `messages/{th,en,ja}.json`의 `labels.*`, 회사가 바꾼 값 = 양식 설정).
- 양식 내부 배치는 화면이 아니라 양식 너비 기준(`@container`)이에요.
- 인쇄: 화면 전용 요소에는 `print:hidden`을 붙여요. 서명 칸은 인쇄 때 점선 · 펜 아이콘 · 버튼이 빠지고 서명 글자만 실선 위에 나와요. "확인 필요" 배지도 숨겨져요.
- 흐린 칸: `unclear`의 칸 경로 + `fieldBoxes[경로]`가 있으면 배지를 눌렀을 때 사진이 그 위치로 확대돼요. 예시 서류의 `fieldBoxes`는 손으로 잰 임시 값이에요.

**AI 읽기 (`app/api/extract/route.ts`)**
- 지시문 = `docs/reference/extract-prompt.txt` 그대로 + `FIELD_BOX_RULE`(칸 위치). 배포 시 파일이 빠지지 않게 `next.config.ts`의 `outputFileTracingIncludes`에 넣어 뒀어요.
- 오류 코드(`rate` · `notDoc` · `badImage` · `aiFail` · `busy` · `noKey`)를 화면이 4개 언어 문장으로 바꿔요. 키가 없으면 SDK가 일반 `Error`를 던져서 메시지로 구분해요.
- 요청 제한은 IP 기준 메모리 카운터(1분 10회)라 서버가 여러 대면 공유되지 않아요 — 로그인 후 사용자 기준으로 바꾸세요.

**장부**
- 몇월분 = **서류 날짜** 기준(`monthKey`). 표시는 `Intl`이라 태국어는 불기 연도(예: กันยายน 2569)로 나와요.
- 스티커는 7색 고정(`STICKERS`), 이름만 회사가 바꿔요.
- 삭제 애니메이션이 도는 동안 화면이 바뀌면 애니메이션이 끊겨요 — `StoredReview`의 `deleting` 상태가 그걸 막고 있어요.

**작업 환경**
- 이 폴더에는 **git이 없어요.** 원래 저장소 이력은 `review/git-log.txt`에만 남아 있어요 (마지막: `d79a252 Add handoff document`). 원본 저장소가 있으면 거기에 이어서 커밋하는 게 좋아요.
- UI 작업 전 코드 백업: 이 폴더 바깥 `work/backup-before-ui-v2/` (app · components · lib · messages · 옛 favicon).
- 이번 작업의 브라우저 확인 스크립트는 프로젝트 **바깥** `work/*.cjs`에 있어요 (`check-batch-upload.cjs`, `check-sign-fonts.cjs`, `check-soft-delete.cjs`, `check-archive.cjs` — 개발 서버 3130 포트 기준, 설치된 Edge 사용). 9단계에서 Playwright 테스트로 옮기면 좋아요.
- 커밋 메시지 끝에는 `Co-Authored-By` 줄을 붙여 왔어요 (선택).
