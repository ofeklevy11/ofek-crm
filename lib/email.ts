import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(to: string, code: string) {
  const { error } = await resend.emails.send({
    from: "Bizly CRM <noreply@bizlycrm.com>",
    to,
    subject: "קוד אימות להרשמה",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">אימות כתובת האימייל</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">הזן את הקוד הבא כדי להשלים את ההרשמה:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
        </div>
        <p style="color: #888; font-size: 13px;">הקוד תקף לשעה אחת. אם לא ביקשת הרשמה, ניתן להתעלם מהודעה זו.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
