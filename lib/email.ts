import { Resend } from "resend";
import { env } from "./env";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

export async function sendVerificationEmail(to: string, code: string) {
  const { error } = await getResend().emails.send({
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

export async function sendPasswordResetEmail(to: string, code: string) {
  const { error } = await getResend().emails.send({
    from: "Bizly CRM <noreply@bizlycrm.com>",
    to,
    subject: "קוד לאיפוס סיסמה",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">איפוס סיסמה</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">הזן את הקוד הבא כדי לאפס את הסיסמה שלך:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
        </div>
        <p style="color: #888; font-size: 13px;">הקוד תקף ל-15 דקות. אם לא ביקשת איפוס סיסמה, ניתן להתעלם מהודעה זו.</p>
      </div>
    `,
  });
  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

export async function sendPasswordChangedEmail(to: string, name: string) {
  const { error } = await getResend().emails.send({
    from: "Bizly CRM <noreply@bizlycrm.com>",
    to,
    subject: "הסיסמה שלך שונתה",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">שלום ${name},</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">הסיסמה שלך במערכת Bizly CRM שונתה בהצלחה.</p>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">אם לא ביצעת את השינוי הזה, פנה אלינו מיד.</p>
      </div>
    `,
  });
  if (error) {
    throw new Error(`Failed to send password changed email: ${error.message}`);
  }
}

export async function sendEmailChangeVerification(to: string, code: string) {
  const { error } = await getResend().emails.send({
    from: "Bizly CRM <noreply@bizlycrm.com>",
    to,
    subject: "קוד אימות לשינוי אימייל",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">אימות כתובת אימייל חדשה</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">הזן את הקוד הבא כדי לאשר את שינוי כתובת האימייל:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
        </div>
        <p style="color: #888; font-size: 13px;">הקוד תקף לשעה אחת. אם לא ביקשת שינוי אימייל, ניתן להתעלם מהודעה זו.</p>
      </div>
    `,
  });
  if (error) {
    throw new Error(`Failed to send email change verification: ${error.message}`);
  }
}

export async function sendAutomationEmail(to: string, subject: string, html: string) {
  const { error } = await getResend().emails.send({
    from: "Bizly CRM <automation@bizlycrm.com>",
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send automation email: ${error.message}`);
  }
}

export async function sendEmailChangedNotification(to: string) {
  const { error } = await getResend().emails.send({
    from: "Bizly CRM <noreply@bizlycrm.com>",
    to,
    subject: "כתובת האימייל שלך שונתה",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">שינוי כתובת אימייל</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">כתובת האימייל שלך במערכת Bizly CRM שונתה.</p>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">אם לא ביצעת את השינוי הזה, פנה אלינו מיד.</p>
      </div>
    `,
  });
  if (error) {
    throw new Error(`Failed to send email changed notification: ${error.message}`);
  }
}
