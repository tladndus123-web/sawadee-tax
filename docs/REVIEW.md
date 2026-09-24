# 코드 검수 요청서 — 태국 세금계산서 · 영수증 장부 (Thai Receipt Ledger)

> 이 파일은 외부 검수자(AI 또는 사람)에게 주는 안내서예요.
> 원래 작업 지시서는 [`docs/PROMPT.md`](PROMPT.md), 기준이 되는 시제품은 [`docs/reference/prototype-ledger.html`](reference/prototype-ledger.html)이에요.
> 작성일: 2026-09-24 · 기준 커밋: 이 문서가 들어간 커밋 (`git log -1`)

---

## 1. 검수자에게 부탁드리는 것

1. **시제품과 똑같이 동작하는지**: `prototype-ledger.html`의 `taxIdOk`, `thaiInt`, `bahtText`, `runChecks`, `normalize`, `claimable`이 `lib/`로 **빠짐없이, 같은 결과로** 옮겨졌는지 확인해 주세요.
2. **돈 계산의 정확성**: 사탕(1/100 바트) 정수 계산, 허용 오차(품목 0.5바트, 합계 1바트, 부가세 max(1바트, 0.2%))
3. **태국어 금액 글자(`bahtText`)의 경계값**: 백만 단위, `เอ็ด` 규칙, 사탕 처리
4. **React / Next.js 코드 품질**: 구조, 타입, 불필요한 재렌더, 접근성(a11y), 모바일 375px
5. **지시서(`PROMPT.md`) 대비 빠진 것 · 잘못 해석한 것**

결과는 **심각도(높음 / 중간 / 낮음) + 파일:줄 + 재현 방법 + 고칠 방법** 형식으로 주시면 좋아요.

---

## 2. 진행 상태

지시서 9단계 중 **1~4단계와 추가 요청 2건**을 끝냈어요. 5단계부터는 아직이에요.

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 참고 파일 읽기, 기능 목록 정리 | 완료 |
| 2 | Next.js 15 + shadcn/ui + 테마 + 4개 언어 뼈대 | 완료 |
| 3 | `lib/` 규칙 + Vitest 테스트 | 완료 (테스트 59개 통과) |
| 4 | `InvoiceView` / `InvoiceEdit`를 샘플 데이터로 그리기 | 완료 |
| 추가 1 | 금액 글자의 영어 · 일본어를 숫자로 (`฿ 64,200.00`) | 완료 |
| 추가 2 | 양식 설정 도구 (블록 순서 · 칸 숨기기 · 칸 이름 바꾸기) | 완료 (지금은 브라우저에만 저장) |
| 5 | Supabase 테이블, RLS, 로그인, 시드 | **아직** |
| 6 | 사진 올리기 + AI 읽기 + `scripts/eval-extract.ts` | **아직** |
| 7 | 장부, 거래처, 지급 관리, 내보내기 | **아직** (자리 표시 화면만 있음) |
| 8 | 대시보드, 설정, 권한 | **아직** (설정 화면에는 양식 설정만 있음) |
| 9 | 마무리 점검, README | **아직** (README는 create-next-app 기본값 그대로) |

---

## 3. 사용자가 정한 것 (바꾸지 말 것)

- 폴더: `C:\dev\thai-receipt-ledger`, git은 로컬에서만
- Supabase: 먼저 로컬(Docker)에서 만들고 나중에 클라우드로 옮김
- AI 모델 기본값: `claude-opus-5-5` (`ANTHROPIC_MODEL` 환경변수로 바꿀 수 있음)
- 로그인: **이메일 매직링크, 초대한 사람만**
- 우리 회사 정보: 시드에 넣지 않고 **설정 화면에서 직접 입력**
- 금액 글자: 태국어는 인쇄된 그대로, **영어 · 일본어는 `฿ 64,200.00`처럼 숫자로** (AI 번역을 쓰지 않음)
- 양식 설정: **회사 전체에 하나, 관리자만** 바꿀 수 있음

---

## 4. 실행 방법

```bash
npm install
npm run dev -- -p 3100      # http://localhost:3100
npm test                    # Vitest
npx tsc --noEmit            # 타입 검사
npx eslint app components lib
```

볼 화면:

| 주소 | 내용 |
|---|---|
| `/ko/documents/sample` | 샘플 서류(PANFOOD, ฿64,200)의 정리된 양식 (보기 / 고치기, 자동 확인, 사진 확대) |
| `/ko/settings` | 양식 설정 + 미리보기 |
| `/ko`, `/th`, `/en`, `/ja` | 화면 언어 4개 |
| `/ko/ledger`, `/ko/vendors` | 아직 "만드는 중" 안내 화면 |

- 저장 · 삭제 버튼은 아직 "5단계에서 연결돼요" 안내만 떠요 (DB가 없어서).
- `.env`는 아직 필요 없어요. `.env.example`만 있어요.

---

## 5. 파일 구조 (직접 만든 것만)

```
app/[locale]/layout.tsx            html · 글꼴 · 테마 · next-intl · Toaster
app/[locale]/(app)/layout.tsx      머리글 · 양식 설정 Provider
app/[locale]/(app)/page.tsx        대시보드 (지금은 제목만)
app/[locale]/(app)/documents/[id]  id=sample만 동작 (SampleReview.tsx)
app/[locale]/(app)/settings        양식 설정 화면
app/[locale]/(app)/ledger|vendors  자리 표시
app/globals.css                    shadcn neutral + 포인트 색 #0d6e53 / #3cbf93, ok·warn·bad·band·rule 토큰, .num .mono .unsure

components/invoice/
  DocumentReview.tsx   사진 + 양식 + 자동 확인 + 저장/닫기/삭제 (react-hook-form + zod)
  InvoiceView.tsx      보기 모드 (블록 8개, 양식 설정 반영)
  InvoiceEdit.tsx      고치기 모드 (같은 배치)
  TriText.tsx          {th,en,ja}를 1줄/3줄로 표시, "확인 필요" 배지
  TriInput.tsx         TH/EN/JA 입력칸 3개
  ItemsTable.tsx       품목 표 (보기 / 고치기, useFieldArray)
  TotalsLadder.tsx     합계 사다리
  SignBoxes.tsx        서명 3칸
  ChecksPanel.tsx      자동 확인 목록 "○/○ 통과"
  PhotoViewer.tsx      react-zoom-pan-pinch: 확대·회전, 흐린 칸 위치로 확대
  fields.tsx           FieldLabel, Kv, Box, Chip, MoneyInput
  form-inputs.tsx      TextIn, DateIn, NumIn (RHF 연결)
  form-config-context.tsx / StoredFormConfig.tsx  양식 설정 Context
components/settings/FormSettings.tsx   양식 설정 화면 (탭 3개 + 미리보기)
components/layout/*                    머리글, 언어 전환, 테마 전환

lib/
  types.ts          LedgerDoc 등 데이터 모양 (sample-document.json 기준 + fieldBoxes)
  money.ts          사탕 정수 계산, fmt / baht 표시
  thai-tax.ts       taxIdOk, fixDate(불교력), addDays, dmy, todayBangkok
  baht-text.ts      thaiInt, bahtText, cleanWords, amountWords
  normalize.ts      normalize, normalizeTotals, blank, dropEmptyItems
  checks.ts         runChecks(13개), flagsFor, claimable, detailText
  doc-schema.ts     zod 스키마 (LedgerDoc과 타입 일치를 satisfies로 보장)
  form-labels.ts    양식 칸 이름 (messages/{th,en,ja}.json + 설정의 덮어쓰기)
  form-config.ts    양식 설정 모양 + sanitizeFormConfig
  form-config-store.ts  (임시) localStorage 저장, 5단계에서 Supabase로 교체 예정
  *.test.ts         Vitest

messages/{ko,th,en,ja}.json   시제품 T · LB · DOC · COPY · CAT · PAY 표를 스크립트로 옮긴 것 + 새 문구
i18n/ · middleware.ts         next-intl 라우팅 (/ko /th /en /ja)
```

---

## 6. 시제품과 일부러 다르게 한 것

| 항목 | 시제품 | 이 앱 | 이유 |
|---|---|---|---|
| 확인 결과 설명 | 한 언어로 완성된 문장 | 숫자 조각 + 번역할 단어 키 (`DetailPart[]`) | 화면 언어를 바꾸면 바로 번역되게 |
| "오늘" 날짜 | UTC | 방콕 시간 (`todayBangkok`) | 태국 오전 7시 전의 "기한 지남" 오판 방지 |
| 돈 계산 | 부동소수점 + `Math.round(x*100)/100` | 사탕 정수 (`toSatang`) | 지시서 요구 |
| 금액 글자 EN/JA | AI 번역 문장 | `฿ 64,200.00` 숫자 (`amountWords`) | 사용자 요청 |
| 위치 칸 | 없음 | `fieldBoxes` (칸 → [x,y,w,h] 0~1) | 흐린 칸을 누르면 사진 확대 (지시서 4번) |
| 3개 언어 표시의 태국어 줄 | 보통 굵기 | `font-medium`(500) | 지시서 "태국어 굵게", 주소가 너무 두꺼워지지 않게 절충 |
| 양식 배치 | 고정 | 양식 설정으로 순서 · 숨김 · 이름 변경 가능 (기본값은 시제품 순서) | 사용자 요청 |
| 내부 배치 기준 | 화면 너비 (`@media`) | 양식 자체 너비 (container query `@container`, `@2xl:`) | 사진 옆에 좁게 놓여도 칸이 깨지지 않게 |

---

## 7. 알고 있는 한계 · 확인이 필요한 점

1. **양식 설정은 지금 `localStorage`에만 저장**돼서 "관리자만"이 아직 강제되지 않아요. 5단계에서 `company_settings.form_config`(jsonb) + RLS로 옮길 예정이에요.
2. **샘플의 `fieldBoxes` 2개**(`customer.name`, `sales.name`)는 사진을 보고 손으로 잰 값이에요 (`SampleReview.tsx`). 6단계부터는 AI가 줘요.
3. **`PhotoViewer`**: 흐린 칸으로 확대할 때 회전을 0으로 되돌려요. 회전한 상태의 좌표 계산은 하지 않아요.
4. **`DocumentReview`**: `useWatch` 전체 값을 매번 `normalize` + `runChecks` 해요. 서류 1장 크기라 괜찮다고 봤지만, 성능 의견을 주세요.
5. **중복 확인**: 샘플 화면에서는 `others=[]`라 항상 "중복 없음"이에요 (DB가 없어서).
6. **고치기 모드에서 조건 문구(`terms`), 양식 코드(`formCode`/`formSince`)는 고칠 수 없어요.** 시제품도 같아요. 필요하면 알려 주세요.
7. **숨긴 칸은 보기 화면에서만 숨겨요.** 고치기 화면에서는 모든 칸이 보여요 (AI가 읽은 값을 잃지 않게).
8. **사용한 버전**: Next.js 15.5, React 19.1, Tailwind v4, zod v4, next-intl v4, react-hook-form 7, shadcn `radix-nova` 스타일 (`cn` 패키지 사용). 지시서의 "Next.js 15"를 만족하는지 확인해 주세요.
9. `.claude/launch.json`은 개발 도구용 설정이에요 (앱과 무관).

---

## 8. 지시서 3번 체크리스트 대비 (화면 부분)

| 항목 | 상태 | 위치 |
|---|---|---|
| 요약 4칸 | 아직 (8단계) | — |
| 사진 올리기 (끌어다 놓기 · 카메라 · 초 · 멈추기) | 아직 (6단계) | — |
| 정리된 양식: 왼쪽 사진 / 오른쪽 양식 | 완료 | `DocumentReview.tsx` |
| 보기 / 고치기 전환 (배치 유지) | 완료 | `DocumentReview.tsx`, `InvoiceEdit.tsx` |
| 양식 언어 3개 언어 / ไทย / EN / 日本語 | 완료 (브라우저에 기억) | `DocumentReview.tsx` |
| 배치 9단계 순서 | 완료 (header 블록이 1+2를 합침) | `InvoiceView.tsx` |
| 흐린 칸: 점선 밑줄 + "확인 필요" 배지 | 완료 (배지를 누르면 사진 확대) | `TriText.tsx`, `PhotoViewer.tsx` |
| 항목, 결제 방법, 지급 완료 + 지급일 | 완료 (체크하면 오늘 날짜 자동) | `DocumentReview.tsx` |
| 자동 확인 목록 ("○/○ 통과", 계산 근거) | 완료 | `ChecksPanel.tsx`, `checks.ts` |
| 저장 / 닫기 / 삭제 (삭제는 화면 안에서 한 번 더) | 화면만 완료, 동작은 5단계 | `DocumentReview.tsx` |
| 장부 목록 · 월 필터 · 그래프 · CSV | 아직 (7단계) | — |
| 설정: 우리 회사 세금번호 | 아직 (8단계) | — |
| 화면 언어 4개, `messages/*.json` | 완료 | `messages/` |

**규칙 (`lib/`)**: 지시서 표의 13개 확인을 모두 구현했어요. 지시서의 테스트 예시(`bahtText` 5개, 세금번호 2개와 마지막 자리 변경, 샘플에서 "흐린 칸" 경고 1개만)가 모두 통과해요.

---

## 9. 테스트 결과 (기준 커밋 시점)

```
lib/baht-text.test.ts    bahtText 14개 경계값, cleanWords
lib/thai-tax.test.ts     taxIdOk(통과/마지막 자리 9가지 실패), 불교력, addDays, 방콕 날짜
lib/normalize.test.ts    샘플 보존, 불교력 + 문서번호 69 유지, 숫자 정리, 빠진 합계 채우기, 옛 데이터 모양, 목록 길이 제한
lib/checks.test.ts       샘플 = "unclear"만 실패, 계산 근거 문자열, 부가세 경계(4320 통과 / 4321 실패), 중복, 확신도
lib/form-config.test.ts  설정 정리(sanitize), 칸 이름 덮어쓰기, 금액 숫자 표기

Test Files  5 passed · Tests  59 passed
tsc --noEmit: 오류 없음 · eslint: 오류 없음
```

화면 확인: Playwright(Chromium)로 1440px · 390px, 라이트 · 다크를 찍어 봤어요. 375px에서 가로 넘침은 없었어요 (품목 표만 자체 가로 스크롤). 캡처는 `review/screenshots/`에 있어요.
