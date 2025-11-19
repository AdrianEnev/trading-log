import nodemailer from 'nodemailer';
import { loadApiEnv } from '@services/config/src/env';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const env = loadApiEnv();
  _transporter = nodemailer.createTransport({
    host: env.SES_SMTP_HOST,
    port: env.SES_SMTP_PORT ?? 587,
    secure: false, // TLS with STARTTLS on port 587
    auth: env.SES_SMTP_USER && env.SES_SMTP_PASS ? { user: env.SES_SMTP_USER, pass: env.SES_SMTP_PASS } : undefined,
  });
  return _transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string; fromName?: string }) {
  const env = loadApiEnv();
  const fromEmail = env.EMAIL_FROM;
  if (!fromEmail) throw new Error('EMAIL_FROM not configured');
  const fromName = opts.fromName || env.EMAIL_FROM_NAME || undefined;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const transporter = getTransporter();
  return transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

export async function sendPasswordResetEmail(params: { to: string; name: string; resetUrl: string }) {
  const { to, name, resetUrl } = params;
  const subject = 'Reset your password';
  const text = `Hi ${name},\n\nClick the link below to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
  const html = `
    <p>Hi ${name},</p>
    <p>Click the button below to reset your password:</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you did not request this, you can ignore this email.</p>
  `;
  return sendMail({ to, subject, text, html });
}
