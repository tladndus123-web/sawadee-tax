# 태국 세금계산서 · 영수증 장부 앱 만들기

## 0. 참고 파일: 먼저 전부 읽어 줘

프로젝트의 `docs/reference/` 폴더에 넣어 둔 파일들이야. **작동하는 시제품을 제대로 된 앱으로 다시 만드는 작업이야.**

| 파일 | 내용 |
|---|---|
| `prototype-ledger.html` | **작동하는 시제품** (HTML 파일 1개). 기능, 화면 흐름, 칸 이름(4개 언어), 자동 확인 규칙, 데이터 모양이 모두 들어 있어. **이게 기준이야.** |
| `extract-prompt.txt` | 사진을 읽을 때 AI에게 주는 지시문. 시제품에서 실제로 쓰는 것 그대로야. |
| `sample-document.json` | 정답 데이터: 아래 사진을 사람이 확인해서 정리한 것 |
| `sample-panfood-invoice.jpg` | 실제 태국 세금계산서 사진 (PANFOOD CO., LTD., ฿64,200) |
| `invoice-form.html` | 정리된 양식 화면의 디자인 예시 |

**작업 원칙**

- 시제품의 기능과 규칙은 **하나도 빠뜨리지 말고** 옮겨 줘.
- 화면은 오픈소스 UI(shadcn/ui)로 **더 깔끔하고, 읽기 쉽고, 모던하게** 다시 만들어 줘.
- 시제품에 있는 것 중 이 앱에서 바꿔야 하는 것:
  - `window.claude` 부분은 Supabase와 Anthropic API로 바꿔 (아래 설명 참고).
  - 한 파일에 몰려 있는 코드는 컴포넌트와 lib 파일로 나눠.

## 1. 만들 것

태국에서 사업하는 우리 회사 직원들이 함께 쓰는 **세금계산서 · 영수증 장부 웹앱**을 만들어 줘.

직원이 할 일은 **사진 올리기 → 확인 → 저장** 세 번뿐이어야 해. 나머지는 앱이 알아서 해:

1. 사진을 자동으로 정리해 (방향 바로잡기, 크기 줄이기, 아이폰 사진 변환).
2. AI가 모든 칸을 읽어.
3. **원본 서류와 같은 배치**로 태국어 · 영어 · 일본어 양식을 만들어.
4. 계산이 맞는지 **자동으로 확인**해.
5. 흐리게 읽힌 칸에 표시를 달아.

- 사용자: 우리 회사 직원 여러 명 (관리자 + 일반 직원)
- 우리 회사는 주로 **사는 쪽(구매자)**이야. 서류의 고객란이 우리 회사야.
- 모바일 우선 웹사이트 (휴대폰과 컴퓨터 모두)

## 2. 기술 스택 (전부 오픈소스)

| 역할 | 사용할 것 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript (strict) |
| UI 컴포넌트 | **shadcn/ui** (Radix UI) + Tailwind CSS v4 |
| 아이콘 | lucide-react |
| 표 | TanStack Table (shadcn Data Table) |
| 차트 | shadcn Charts (Recharts) |
| 폼 | react-hook-form + zod (`useFieldArray`로 품목 줄) |
| 다국어 | next-intl (화면 언어: ko, th, en, ja) |
| 알림 | sonner |
| 테마 | next-themes (라이트 / 다크) |
| 사진 | browser-image-compression, heic2any, react-zoom-pan-pinch |
| DB / 로그인 / 사진 저장 | Supabase (Postgres + Auth + Storage), RLS |
| AI 읽기 | `@anthropic-ai/sdk`, **서버에서만** 호출 |
| 내보내기 | exceljs (XLSX), CSV (UTF-8 BOM) |
| 테스트 | Vitest (규칙), Playwright (올리기 → 저장 흐름) |
| 폰트 | next/font: IBM Plex Sans KR / Thai / JP + IBM Plex Mono (숫자) |

모델 이름은 환경변수 `ANTHROPIC_MODEL`로 받아. 기본값은 이미지를 읽을 수 있는 최신 Claude 모델 중 정확도가 높은 것으로 해 줘.

## 3. 시제품에서 옮길 것 (체크리스트)

### 화면
- [ ] 맨 위 요약 4칸: 매입 합계 / 돌려받을 수 있는 부가세 / 미지급 금액(기한 지난 건수는 빨간색) / 확인 필요 건수
- [ ] 사진 올리기: 끌어다 놓기, 파일 선택, 휴대폰 카메라, 읽는 중에는 걸린 초와 "멈추기" 버튼
- [ ] **정리된 양식 화면**: 왼쪽 원본 사진, 오른쪽 양식
  - [ ] **보기 / 고치기** 전환 (고치기에서도 배치는 그대로)
  - [ ] 양식 언어 전환: **3개 언어 / ไทย / EN / 日本語**
  - [ ] 배치 (시제품의 `invoiceView` 순서 그대로):
    1. 판매자 블록
    2. 문서 블록 (양식 번호, 문서번호, 날짜, 서류 종류)
    3. 서류 제목, 원본/사본
    4. 고객 블록 / 조건 블록 (주문번호, 결제 조건, 지급 기한, 영업 담당자)
    5. 품목 표
    6. 배송 · 조건 문구 · 메모 / 합계 사다리
    7. 금액 글자
    8. 서명 3칸
    9. 양식 코드
  - [ ] 흐리게 읽힌 칸(`unclear`): 점선 밑줄과 "확인 필요" 배지
  - [ ] 항목, 결제 방법, **지급 완료 체크 + 지급일**
  - [ ] 아래에 **자동 확인** 목록 ("○/○ 통과", 초록 체크 / 주황 느낌표, 칸마다 계산 근거 표시)
  - [ ] 저장 / 닫기 / 삭제 (삭제는 화면 안에서 한 번 더 확인)
- [ ] 장부 목록: 날짜 · 판매자 + 문서번호 · 서류 종류 · 지급 상태(지급 완료 / 미지급 · 기한 / 기한 지남) · 합계 · 확인 필요 점
  - [ ] 표시 언어 전환(TH / EN / JA), 월 필터, 항목별 막대 그래프, CSV 내보내기
- [ ] 설정: 우리 회사 세금번호
- [ ] 화면 언어 4개 (ko / th / en / ja): 시제품의 `T`, `LB`, `DOC`, `CAT`, `PAY` 표를 `messages/*.json`으로 옮겨 줘.

### 규칙 (`lib/thai-tax.ts`, `lib/baht-text.ts`, `lib/checks.ts`)

시제품의 `taxIdOk`, `thaiInt`, `bahtText`, `runChecks`, `normalize`, `claimable`을 그대로 옮기고 **Vitest 테스트를 꼭 붙여 줘.**

| 확인 | 규칙 |
|---|---|
| 판매자 세금번호 | 13자리. 앞 12자리에 13→2를 곱해 더한 값을 `sum`이라 할 때, `(11 − sum % 11) % 10`이 마지막 자리와 같아야 함 |
| 구매자 세금번호 | 정식 세금계산서면 반드시 있어야 하고, 같은 규칙으로 검사 |
| 우리 회사 | 구매자 세금번호 = 설정의 우리 회사 세금번호 |
| 품목 | 줄마다 수량 × 단가 = 금액, 모든 줄의 합 = 합계 |
| 계산 흐름 | 합계 − 할인 = 할인 후, 할인 후 − 계약금 = 공제 후, 면세 + 과세 = 공제 후 |
| 부가세 | 과세 금액 × 7%와 적힌 부가세의 차이가 max(1바트, 0.2%) 이하 |
| 최종 합계 | 과세 + 면세 + 부가세 = 최종 합계 |
| 금액 글자 | `bahtText(최종 합계)`가 인쇄된 태국어 글자와 같음 (공백 · 괄호 무시) |
| 지급 기한 | 날짜 + 외상 일수 = 지급 기한 |
| 날짜 | 연도가 2400보다 크면 543을 빼 (2569 → 2026). 문서번호 속 `69`는 그대로 둬 |
| 흐린 칸 | `unclear` 목록이 비어 있어야 통과 |
| 중복 | 같은 판매자 세금번호 + 같은 문서번호가 이미 있으면 경고 |
| AI 확신도 | `confidence`가 `low`면 경고 |

- 돌려받을 수 있는 부가세는 정식 세금계산서이면서 구매자가 우리 회사인 서류만 더해.
- 돈 계산은 사탕(1/100 바트) **정수**로 해.

**테스트 예시**

| 금액 | `bahtText` 결과 |
|---|---|
| 64200 | หกหมื่นสี่พันสองร้อยบาทถ้วน |
| 21 | ยี่สิบเอ็ดบาทถ้วน |
| 1000001 | หนึ่งล้านเอ็ดบาทถ้วน |
| 0.5 | ห้าสิบสตางค์ |
| 11.25 | สิบเอ็ดบาทยี่สิบห้าสตางค์ |

- 세금번호: `0745538001265`, `0105557035035`은 통과, 마지막 자리를 바꾸면 실패.
- `sample-document.json`: 모든 확인이 통과해야 해 (흐린 칸 경고 1개만 빼고).

## 4. 시제품과 다르게 할 것 (더 좋게)

- **여러 장 한 번에 올리기**: 장마다 진행 상태 표시 → "검토 대기" 목록
- **사진 확대 · 회전**. AI가 칸의 위치를 알려주면 흐린 칸을 눌렀을 때 사진의 그 부분을 확대해서 보여 줘.
- **거래처 사전** (`vendors`): 판매자 세금번호를 기준으로, 한 번 고친 3개 언어 이름은 다음 서류부터 자동 적용해 줘. 매번 번역이 달라지지 않게.
- **대시보드**: 곧 지급해야 할 청구서 목록, 최근 6개월 추이 차트
- **내보내기**: XLSX 추가, 양식 PDF (3개 언어)
- **권한**: 관리자(삭제, 설정, 직원 초대)와 직원(올리기, 고치기)
- **기록**: 누가 언제 올리고 고쳤는지

## 5. 데이터

시제품 `normalize()`가 만드는 모양이 기준이야 (`sample-document.json` 참고). Supabase 테이블:

```sql
company_settings (id, name jsonb, tax_id text, branch text)
vendors (id, tax_id text unique, name jsonb, address jsonb, tel text, fax text)
documents (
  id uuid pk, created_by, created_at, updated_by, updated_at, status text,  -- draft | reviewed
  doc_type, doc_title jsonb, copy_kind, form_serial, doc_no, doc_date date, date_was_buddhist bool,
  vendor_id fk, seller jsonb, customer jsonb,            -- 시제품의 seller / customer 모양 그대로
  order_no, term jsonb, credit_days int, due_date date, sales jsonb, delivery jsonb,
  total, discount, after_disc, deposit, after_dep, exempt, taxable, vat, net, wht  numeric(14,2),
  words_printed text, words jsonb, terms jsonb, signs jsonb, form_code, form_since,
  category, payment, paid bool, paid_date date, confidence, unclear text[], note jsonb, flags text[],
  photo_path text, ai_raw jsonb
)
document_items (id, document_id fk cascade, line_no, code, "desc" jsonb, wh, qty numeric, unit jsonb, price numeric(14,2), amount numeric(14,2))
```

- 글자 칸은 모두 `{th, en, ja}` jsonb야.
- RLS: 직원은 읽기 · 추가 · 수정, 삭제와 설정은 관리자만.
- Storage 버킷 `documents`는 비공개, 화면에서는 signed URL로 보여 줘.
- 시드: `sample-document.json` + 사진 1건

## 6. AI 읽기 (`app/api/extract/route.ts`)

- API 키는 서버에만 둬. 브라우저에서 절대 부르지 마.
- 지시문은 `extract-prompt.txt`를 그대로 써. 다만 답은 **tool use(구조화 출력)**로 받고 zod로 검증해 줘.
  - 추가로 받을 칸: `field_boxes` (칸 이름 → 사진 속 위치 `[x, y, w, h]`, 0~1 비율, 가능한 경우만)
- 받은 뒤에는 시제품 `normalize()`로 정리해: 불교력 변환, 빠진 합계 칸 채우기, 숫자 정리.
- 그다음 거래처 사전으로 이름을 덮어쓰고, 자동 확인을 돌려.
- 오류마다 친절한 문장을 보여 줘: 요청이 너무 많음 / 사진을 못 읽음 / 서류가 아님 / 네트워크 문제. 사람마다 1분 요청 횟수 제한도 걸어 줘.
- **정확도 테스트**: `sample-panfood-invoice.jpg`를 실제로 읽혀서 `sample-document.json`과 칸마다 비교하는 스크립트(`scripts/eval-extract.ts`)를 만들어 줘. 몇 칸이 맞았는지 보여 주면 돼.

## 7. 디자인: 매우 깔끔하고, 읽기 쉽고, 모던하게

- shadcn/ui neutral 테마, 포인트 색 **한 가지**: `#0d6e53` (다크 모드 `#3cbf93`)
- 색은 쓰임새로만: 통과 = 초록, 확인 필요 = 주황, 오류 · 기한 지남 = 빨강
- 양식은 원본처럼 **얇은 테두리 칸**. 합계 사다리 맨 아래 최종 합계만 옅은 초록 바탕.
- 금액: 모노 폰트, `tabular-nums`, 오른쪽 정렬, `฿ 64,200.00`
- 태국어 줄 간격 1.7 이상, `lang` 속성으로 언어별 폰트 적용
- 3개 언어 표시일 때: 태국어 굵게 1줄, 영어 · 일본어는 작은 회색 글자로 아래에
- 여백은 넉넉하게, 글자 크기는 4~5단계만. 카드 · 그림자 남발 금지, 이모지 금지(lucide 아이콘 사용)
- 375px 휴대폰 폭에서 가로로 밀리면 안 돼. 품목 표만 자체 가로 스크롤을 허용하고, 장부 목록은 휴대폰에서 카드 목록으로 바꿔 줘.
- WCAG AA 대비, 키보드 조작, 잘 보이는 포커스 표시, 스켈레톤 로딩, 데이터가 없을 때 안내 문구

## 8. 폴더 구조

```
app/[locale]/(auth)/login
app/[locale]/(app)/page.tsx                 # 대시보드 + 올리기
app/[locale]/(app)/documents/[id]           # 정리된 양식
app/[locale]/(app)/ledger
app/[locale]/(app)/vendors
app/[locale]/(app)/settings
app/api/extract/route.ts
components/invoice/  InvoiceView  InvoiceEdit  TriText  TriInput  ItemsTable  TotalsLadder  SignBoxes  ChecksPanel  PhotoViewer
components/upload/   DropZone  UploadQueue
lib/  thai-tax.ts  baht-text.ts  checks.ts  normalize.ts  extract-schema.ts  export.ts  supabase/*
messages/{ko,th,en,ja}.json
scripts/eval-extract.ts
supabase/migrations/*  supabase/seed.sql
docs/reference/*
```

`TriText`는 `{th, en, ja}`와 표시 모드를 받아 1줄 또는 3줄로 그려. `TriInput`은 TH / EN / JA 입력칸 3개야. 양식 전체에서 재사용해 줘.

## 9. 진행 순서 (단계마다 멈추고 결과를 보여 줘)

1. 참고 파일을 읽고, 시제품 기능 목록을 정리해서 나에게 보여 줘. 빠진 게 없는지 같이 확인하자.
2. 프로젝트 만들기, shadcn, 테마, 4개 언어 뼈대
3. `lib/` 규칙 + 테스트 (모두 통과해야 다음 단계로)
4. `InvoiceView` / `InvoiceEdit`를 `sample-document.json`으로 그리기. 시제품과 나란히 비교한 화면을 보여 줘.
5. Supabase 테이블, RLS, 로그인, 시드
6. 사진 올리기 + AI 읽기 + `scripts/eval-extract.ts` 결과
7. 장부, 거래처, 지급 관리, 내보내기
8. 대시보드, 설정, 권한
9. 마무리 점검: 휴대폰, 다크 모드, 접근성, `README.md` (설치 방법, 환경변수, Vercel 배포)

## 10. 환경변수 (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

## 11. 규칙

- 모르거나 골라야 할 게 있으면 짐작하지 말고 **먼저 나에게 물어봐.**
- 나는 개발 초보야. 단계마다 무엇을 했는지 쉬운 한국어로 짧게 설명해 줘.
- 코드 주석은 영어로 써도 돼.
- `.env`는 git에 절대 올리지 마.
