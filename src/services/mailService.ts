import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

type MailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  _dealerName?: string; // Optional field for branding the "from" name
};

function smtpReady() {
  return Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass && env.mailFrom);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!smtpReady()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  return transporter;
}

export async function sendMail(input: MailInput) {
  const tx = getTransporter();
  if (!tx) {
    console.warn('[mail] SMTP not configured. Skipping email send.');
    return { sent: false, skipped: true, reason: 'smtp_not_configured' };
  }

  try {
    const info = await tx.sendMail({
      from: `${input._dealerName || 'Auto Dealer'}`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    console.log(`[mail] ✅ Sent → ${input.to} | subject: "${input.subject}" | msgId: ${info.messageId}`);
    return { sent: true, skipped: false };
  } catch (err: any) {
    console.error(`[mail] ❌ FAILED → ${input.to} | subject: "${input.subject}" | error: ${err?.message}`);
    throw err;
  }
}

export function staffVerificationTemplate(params: {
  fullName: string;
  roleLabel: string;
  verificationLink: string;
  loginUrl: string;
}) {
  const { fullName, roleLabel, verificationLink, loginUrl } = params;
  const text = [
    `Hi ${fullName},`,
    '',
    `Your ${roleLabel} account has been created.`,
    'Please verify your email using the link below:',
    verificationLink,
    '',
    `After verification, log in here: ${loginUrl}`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111;">
      <h2 style="margin:0 0 12px;">Welcome to Auto Advant</h2>
      <p>Hi ${fullName},</p>
      <p>Your <strong>${roleLabel}</strong> account has been created.</p>
      <p>Please verify your email to activate access:</p>
      <p>
        <a href="${verificationLink}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">
          Verify Email
        </a>
      </p>
      <p>If the button does not work, open this link in your browser:</p>
      <p><a href="${verificationLink}">${verificationLink}</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
      <p>After verification, sign in here:</p>
      <p><a href="${loginUrl}">${loginUrl}</a></p>
    </div>
  `;

  return { text, html };
}
