import nodemailer from 'nodemailer';
import { MAILER_CONFIG } from './../env';

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (!MAILER_CONFIG) return;
  let transporter = nodemailer.createTransport(MAILER_CONFIG);
  var message = {
    from: MAILER_CONFIG.from || MAILER_CONFIG.auth.user,
    to,
    subject,
    text,
    html
  };
  try {
    let info = await transporter.sendMail(message);
    console.log(`Notification to ${to} sent`, info);
  } catch(e) {
    console.error(`nodemailer failed to send an email:\n`, e);
  }
}
