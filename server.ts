import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import express, { type NextFunction, type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const ADMIN_EMAIL = 'massinissa@bmsinformatique.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FirebaseAppletConfig {
  projectId?: string;
}

interface EmailRecipient {
  nom: string;
  email: string;
}

interface TaskEmailPayload {
  idTache: string;
  titreProjet: string;
  styleMontage: string;
  dureeVideo: string;
  deadline: string;
  prixDZD: number;
  visibilite: 'Tous' | 'Selection';
  portalUrl?: string;
}

function loadFirebaseProjectId(): string | undefined {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as FirebaseAppletConfig;
    if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
      return parsed.projectId;
    }
  } catch {
    // Ignore missing config in isolated builds
  }
  return undefined;
}

const firebaseProjectId = loadFirebaseProjectId();
const adminApp = getApps().length
  ? getApp()
  : initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
const adminAuth = getAuth(adminApp);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSafeHttpUrl(rawUrl: string | undefined, fallbackUrl: string): string {
  const candidate = (rawUrl || fallbackUrl || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function formatDzdServer(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('fr-FR')
    .format(safe)
    .replace(/\u202f|\u00a0/g, ' ');
  return `${formatted} DZD`;
}

function formatDateFrServer(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

function getEmailProviderConfig() {
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpPort = Number(process.env.SMTP_PORT || '587');
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpFrom = (process.env.SMTP_FROM || smtpUser || '').trim();
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  if (smtpHost && smtpUser && smtpPass) {
    return {
      configured: true as const,
      provider: 'smtp' as const,
      smtp: {
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom || smtpUser,
      },
    };
  }

  if (resendApiKey) {
    return {
      configured: true as const,
      provider: 'resend' as const,
      resend: {
        apiKey: resendApiKey,
        from: smtpFrom || 'Portail Monteurs Vidéo <onboarding@resend.dev>',
      },
    };
  }

  return {
    configured: false as const,
    provider: null,
  };
}

async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification administrateur requise.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Jeton d’authentification manquant.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || '').trim().toLowerCase();
    if (decoded.email_verified !== true || email !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Accès réservé à l’administrateur autorisé.' });
      return;
    }
    res.locals.adminEmail = email;
    next();
  } catch {
    res.status(401).json({ error: 'Session administrateur invalide ou expirée.' });
  }
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeRfc2047Utf8(value: string): string {
  const clean = sanitizeHeaderValue(value);
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function buildGmailRawMessage(params: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `pmv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const safeFrom = sanitizeHeaderValue(params.fromEmail);
  const safeTo = sanitizeHeaderValue(params.toEmail);
  const encodedSubject = encodeRfc2047Utf8(params.subject);

  const lines = [
    ...(safeFrom ? [`From: ${encodeRfc2047Utf8('Portail Monteurs Vidéo')} <${safeFrom}>`] : []),
    `To: ${safeTo}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.text, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.html, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

function buildMissionEmailContent(params: {
  recipientNom: string;
  task: TaskEmailPayload;
  safePortalUrl: string;
}) {
  const { recipientNom, task, safePortalUrl } = params;
  const prixLabel = formatDzdServer(task.prixDZD);
  const deadlineLabel = formatDateFrServer(task.deadline);
  const visLabel =
    task.visibilite === 'Selection' ? 'Mission dédiée (sélectionnée pour vous)' : 'Mission ouverte';

  const subject = `[Portail Monteurs] Nouvelle mission disponible : ${task.idTache} — ${task.titreProjet}`;

  const textLines = [
    `Bonjour ${recipientNom},`,
    '',
    `${visLabel} : une nouvelle mission vidéo est disponible sur le Portail Monteurs Vidéo.`,
    '',
    `• Identifiant : ${task.idTache}`,
    `• Projet : ${task.titreProjet}`,
    `• Style : ${task.styleMontage}`,
    `• Durée estimée : ${task.dureeVideo}`,
    `• Rémunération : ${prixLabel}`,
    `• Échéance : ${deadlineLabel}`,
    '',
    safePortalUrl
      ? `Connectez-vous à votre espace monteur pour l'accepter : ${safePortalUrl}`
      : 'Connectez-vous à votre espace monteur pour l’accepter.',
    '',
    'Portail Monteurs Vidéo',
  ];

  const html = `
<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:24px;background-color:#F6F6F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #E5E5E5;background:#9A3412;color:#FFFFFF;">
          <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;opacity:0.9;">
            ${escapeHtml(visLabel)}
          </p>
          <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;font-weight:700;">
            ${escapeHtml(task.idTache)} — ${escapeHtml(task.titreProjet)}
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#404040;">
            Bonjour <strong>${escapeHtml(recipientNom)}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#404040;">
            Une nouvelle mission de montage vidéo vient d'être mise à disposition dans votre espace monteur :
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F6F6;border:1px solid #E5E5E5;border-radius:12px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 18px;font-size:13px;line-height:1.7;color:#262626;">
                <div><strong>Style :</strong> ${escapeHtml(task.styleMontage)}</div>
                <div><strong>Durée estimée :</strong> ${escapeHtml(task.dureeVideo)}</div>
                <div><strong>Échéance :</strong> ${escapeHtml(deadlineLabel)}</div>
                <div><strong>Rémunération :</strong> <span style="color:#05944F;font-weight:700;">${escapeHtml(prixLabel)}</span></div>
              </td>
            </tr>
          </table>
          ${
            safePortalUrl
              ? `<a href="${escapeHtml(safePortalUrl)}" style="display:inline-block;padding:12px 20px;background:#9A3412;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:10px;">Accéder à l'Espace Monteur</a>`
              : ''
          }
          <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#737373;">
            Connectez-vous avec votre numéro de téléphone et votre code d'accès pour réserver la mission.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  return { subject, text: textLines.join('\n'), html };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/email-status', requireAdminAuth, (_req: Request, res: Response) => {
    const cfg = getEmailProviderConfig();
    res.json({
      configured: cfg.configured,
      provider: cfg.provider,
    });
  });

  app.post('/api/send-task-email', requireAdminAuth, async (req: Request, res: Response) => {
    const body = req.body as {
      task?: Partial<TaskEmailPayload>;
      recipients?: Array<Partial<EmailRecipient>>;
      gmailAccessToken?: unknown;
    } | null;

    if (!body || !body.task || !Array.isArray(body.recipients)) {
      res.status(400).json({ error: 'Paramètres de notification invalides.' });
      return;
    }

    const rawTask = body.task;
    const idTache = typeof rawTask.idTache === 'string' ? rawTask.idTache.trim().slice(0, 32) : '';
    const titreProjet =
      typeof rawTask.titreProjet === 'string' ? rawTask.titreProjet.trim().slice(0, 160) : '';
    const styleMontage =
      typeof rawTask.styleMontage === 'string' ? rawTask.styleMontage.trim().slice(0, 80) : '';
    const dureeVideo =
      typeof rawTask.dureeVideo === 'string' ? rawTask.dureeVideo.trim().slice(0, 20) : '';
    const deadline =
      typeof rawTask.deadline === 'string' ? rawTask.deadline.trim().slice(0, 30) : '';
    const prixDZD =
      typeof rawTask.prixDZD === 'number' && Number.isFinite(rawTask.prixDZD)
        ? Math.max(0, Math.round(rawTask.prixDZD))
        : 0;
    const visibilite = rawTask.visibilite === 'Selection' ? 'Selection' : 'Tous';

    if (!idTache || !titreProjet) {
      res.status(400).json({ error: 'Informations de la mission incomplètes.' });
      return;
    }

    const deduped = new Map<string, EmailRecipient>();
    for (const item of body.recipients.slice(0, 50)) {
      const email = typeof item?.email === 'string' ? item.email.trim().toLowerCase() : '';
      const nom = typeof item?.nom === 'string' ? item.nom.trim().slice(0, 120) : 'Monteur';
      if (email && email.length <= 254 && EMAIL_PATTERN.test(email)) {
        deduped.set(email, { email, nom: nom || 'Monteur' });
      }
    }

    const validRecipients = Array.from(deduped.values());
    const cfg = getEmailProviderConfig();
    const gmailAccessToken =
      typeof body.gmailAccessToken === 'string' ? body.gmailAccessToken.trim() : '';

    if (validRecipients.length === 0) {
      res.status(200).json({
        configured: cfg.configured || Boolean(gmailAccessToken),
        provider: cfg.provider || (gmailAccessToken ? 'gmail' : null),
        sentCount: 0,
        failedCount: 0,
        totalRecipients: 0,
        gmailAuthExpired: false,
      });
      return;
    }

    if (!cfg.configured && !gmailAccessToken) {
      res.status(200).json({
        configured: false,
        provider: null,
        sentCount: 0,
        failedCount: 0,
        totalRecipients: validRecipients.length,
        gmailAuthExpired: false,
      });
      return;
    }

    const envAppUrl = (process.env.APP_URL || '').trim();
    const fallbackPortalUrl =
      envAppUrl && envAppUrl !== 'MY_APP_URL'
        ? `${envAppUrl.replace(/\/$/, '')}/?espace=monteur`
        : '';
    const safePortalUrl = sanitizeSafeHttpUrl(
      typeof rawTask.portalUrl === 'string' ? rawTask.portalUrl : undefined,
      fallbackPortalUrl
    );

    const taskPayload: TaskEmailPayload = {
      idTache,
      titreProjet,
      styleMontage: styleMontage || 'Montage vidéo',
      dureeVideo: dureeVideo || '—',
      deadline: deadline || '—',
      prixDZD,
      visibilite,
      portalUrl: safePortalUrl,
    };

    let sentCount = 0;
    let failedCount = 0;
    let gmailAuthExpired = false;
    let errorDetail: string | undefined;
    let usedProvider: 'smtp' | 'resend' | 'gmail' = 'gmail';

    if (cfg.configured && cfg.provider === 'smtp') {
      usedProvider = 'smtp';
      const transporter = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        auth: {
          user: cfg.smtp.user,
          pass: cfg.smtp.pass,
        },
      });

      const results = await Promise.allSettled(
        validRecipients.map((recipient) => {
          const { subject, text, html } = buildMissionEmailContent({
            recipientNom: recipient.nom,
            task: taskPayload,
            safePortalUrl,
          });
          return transporter.sendMail({
            from: cfg.smtp.from,
            to: recipient.email,
            subject,
            text,
            html,
          });
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') sentCount++;
        else failedCount++;
      }
    } else if (cfg.configured && cfg.provider === 'resend') {
      usedProvider = 'resend';
      const results = await Promise.allSettled(
        validRecipients.map(async (recipient) => {
          const { subject, text, html } = buildMissionEmailContent({
            recipientNom: recipient.nom,
            task: taskPayload,
            safePortalUrl,
          });
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfg.resend.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: cfg.resend.from,
              to: [recipient.email],
              subject,
              text,
              html,
            }),
          });
          if (!resp.ok) {
            throw new Error(`Resend HTTP ${resp.status}`);
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') sentCount++;
        else failedCount++;
      }
    } else if (gmailAccessToken) {
      usedProvider = 'gmail';
      const fromEmail =
        typeof res.locals.adminEmail === 'string' ? res.locals.adminEmail : ADMIN_EMAIL;

      const results = await Promise.allSettled(
        validRecipients.map(async (recipient) => {
          const { subject, text, html } = buildMissionEmailContent({
            recipientNom: recipient.nom,
            task: taskPayload,
            safePortalUrl,
          });
          const raw = buildGmailRawMessage({
            fromEmail,
            toEmail: recipient.email,
            subject,
            text,
            html,
          });
          const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${gmailAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw }),
          });
          if (!resp.ok) {
            const errJson = (await resp.json().catch(() => null)) as {
              error?: { message?: string; status?: string };
            } | null;
            if (resp.status === 401) {
              gmailAuthExpired = true;
            }
            throw new Error(errJson?.error?.message || `Gmail HTTP ${resp.status}`);
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          sentCount++;
        } else {
          failedCount++;
          if (!errorDetail) {
            errorDetail = r.reason instanceof Error ? r.reason.message : String(r.reason);
          }
        }
      }
    }

    res.json({
      configured: true,
      provider: usedProvider,
      sentCount,
      failedCount,
      totalRecipients: validRecipients.length,
      gmailAuthExpired,
      errorDetail,
    });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const portFlagIdx = process.argv.indexOf('--port');
  const cliPort =
    portFlagIdx !== -1 && process.argv[portFlagIdx + 1]
      ? Number(process.argv[portFlagIdx + 1])
      : NaN;
  const port =
    Number.isFinite(cliPort) && cliPort > 0
      ? cliPort
      : isProduction && process.env.PORT
      ? Number(process.env.PORT) || 3000
      : 3000;

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
