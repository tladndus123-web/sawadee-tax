// Sign-in and invite emails (Supabase Auth) in the four screen languages, one plain card, one button.
// Applied to the cloud project by scripts/setup-email.ts; also usable in supabase/config.toml.

const wrap = (title: string, lines: string[], button: string) => `<!doctype html>
<html>
<body style="margin:0;padding:24px 12px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans Thai','Noto Sans JP','Apple SD Gothic Neo',sans-serif;color:#1d1d1f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border-radius:18px;padding:32px 28px">
      <tr><td style="font-size:13px;font-weight:600;color:#6e6e73;padding-bottom:6px">태국 영수증 장부 · สมุดใบเสร็จ · タイ領収書台帳</td></tr>
      <tr><td style="font-size:22px;font-weight:700;padding-bottom:18px">${title}</td></tr>
      ${lines.map((l) => `<tr><td style="font-size:14px;line-height:1.6;color:#424245;padding-bottom:6px">${l}</td></tr>`).join("\n      ")}
      <tr><td style="padding:22px 0 20px">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:999px">${button}</a>
      </td></tr>
      <tr><td style="font-size:12px;line-height:1.6;color:#86868b;border-top:1px solid #e5e5ea;padding-top:14px">
        링크는 1시간 동안 한 번만 쓸 수 있어요 · ลิงก์ใช้ได้ครั้งเดียวภายใน 1 ชั่วโมง · リンクは1時間以内に1回だけ使えます · The link works once, for 1 hour.<br>
        요청하지 않았다면 이 메일을 무시하세요 · หากไม่ได้ขอ โปรดละเว้นอีเมลนี้ · 心当たりがない場合は破棄してください · If you didn't ask for this, ignore this email.
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

export const magicLink = {
  subject: "로그인 링크 · ลิงก์เข้าสู่ระบบ · ログインリンク · Sign-in link",
  content: wrap(
    "로그인 · เข้าสู่ระบบ · ログイン",
    [
      "아래 버튼을 누르면 바로 로그인돼요.",
      "กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ",
      "下のボタンを押すとログインします。",
      "Tap the button below to sign in.",
    ],
    "로그인 · เข้าสู่ระบบ · ログイン · Sign in",
  ),
};

export const invite = {
  subject: "초대가 도착했어요 · คุณได้รับคำเชิญ · 招待が届きました · You're invited",
  content: wrap(
    "초대 · คำเชิญ · ご招待",
    [
      "회사 영수증 장부에 초대되었어요. 버튼을 누르면 가입과 로그인이 한 번에 돼요.",
      "คุณได้รับเชิญให้ใช้สมุดใบเสร็จของบริษัท กดปุ่มเพื่อเข้าร่วมและเข้าสู่ระบบ",
      "会社の領収書台帳に招待されました。ボタンを押すと参加とログインが完了します。",
      "You've been invited to your company's receipt ledger. Tap the button to join and sign in.",
    ],
    "참여하기 · เข้าร่วม · 参加する · Join",
  ),
};
