import {
  ADMIN_WHATSAPP_NUMBER,
  TaskRecord,
  TaskStatus,
  TASK_CONSTRAINTS,
} from '../types';

export function formatDZD(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('fr-FR')
    .format(safe)
    .replace(/\u202f|\u00a0/g, ' ');
  return `${formatted} DZD`;
}

export function formatCountdownMMSS(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildChefMonteurWhatsAppUrl(params: {
  idTache: string;
  titreProjet: string;
  prixDZD: number;
  monteurNom: string;
  monteurPhone: string;
}): string {
  const msg = `Bonjour chef monteur, je suis ${params.monteurNom} (${formatPhoneDisplay(
    params.monteurPhone
  )}). Je viens d'accepter la mission ${params.idTache} « ${params.titreProjet} » (${formatDZD(
    params.prixDZD
  )}) et je souhaite en discuter avec vous.`;
  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

export function toWhatsAppInternationalPhone(rawPhone: string): string {
  const norm = normalizePhone(rawPhone);
  if (norm.startsWith('+')) {
    return norm.slice(1).replace(/\D/g, '');
  }
  const digits = norm.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  if (/^0[567]\d{8}$/.test(digits)) {
    return `213${digits.slice(1)}`;
  }
  return digits;
}

export function buildMonteurMissionWhatsAppUrl(params: {
  monteurPhone: string;
  monteurNom: string;
  idTache: string;
  titreProjet: string;
  prixDZD: number;
  deadline: string;
}): string {
  const intlPhone = toWhatsAppInternationalPhone(params.monteurPhone);
  const msg = `Bonjour ${params.monteurNom}, une mission vidéo est disponible pour vous sur le Portail Monteurs :\n• ${params.idTache} — ${params.titreProjet}\n• Rémunération : ${formatDZD(params.prixDZD)}\n• Échéance : ${formatDateFR(params.deadline)}\nConnectez-vous à votre espace monteur pour l'accepter.`;
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`;
}

export function buildMonteurDirectWhatsAppUrl(params: {
  monteurPhone: string;
  monteurNom?: string;
  idTache?: string;
  titreProjet?: string;
}): string | null {
  const intlPhone = toWhatsAppInternationalPhone(params.monteurPhone);
  if (!intlPhone || intlPhone.length < 6) return null;
  const greeting = params.monteurNom ? `Bonjour ${params.monteurNom}` : 'Bonjour';
  const msg =
    params.idTache && params.titreProjet
      ? `${greeting}, concernant la mission ${params.idTache} « ${params.titreProjet} » sur le Portail Monteurs :`
      : `${greeting}, je vous contacte depuis le Portail Monteurs Vidéo.`;
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`;
}

export function buildMonteurMissionMailtoUrl(params: {
  monteurEmail: string;
  monteurNom: string;
  idTache: string;
  titreProjet: string;
  styleMontage: string;
  dureeVideo: string;
  prixDZD: number;
  deadline: string;
  portalUrl?: string;
}): string {
  const subject = `[Portail Monteurs] Nouvelle mission disponible : ${params.idTache} — ${params.titreProjet}`;
  const bodyLines = [
    `Bonjour ${params.monteurNom},`,
    '',
    'Une nouvelle mission de montage vidéo est disponible dans votre espace monteur :',
    `• Identifiant : ${params.idTache}`,
    `• Projet : ${params.titreProjet}`,
    `• Style : ${params.styleMontage}`,
    `• Durée : ${params.dureeVideo}`,
    `• Rémunération : ${formatDZD(params.prixDZD)}`,
    `• Échéance : ${formatDateFR(params.deadline)}`,
    '',
    params.portalUrl
      ? `Connectez-vous à votre espace monteur : ${params.portalUrl}`
      : 'Connectez-vous à votre espace monteur pour accepter cette mission.',
  ];
  return `mailto:${encodeURIComponent(params.monteurEmail.trim().toLowerCase())}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}

export function formatDateFR(isoDate: string): string {
  if (!isoDate || !TASK_CONSTRAINTS.DEADLINE_PATTERN.test(isoDate)) {
    return isoDate || '—';
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatTimestampFR(
  ts: { toDate?: () => Date; seconds?: number } | null | undefined,
  fallbackIsoDate?: string
): string {
  let date: Date | null = null;
  if (ts && typeof ts.toDate === 'function') {
    date = ts.toDate();
  } else if (ts && typeof ts.seconds === 'number') {
    date = new Date(ts.seconds * 1000);
  }
  if (!date || Number.isNaN(date.getTime())) {
    return fallbackIsoDate ? formatDateFR(fallbackIsoDate) : '—';
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function normalizePhone(raw: string): string {
  let cleaned = raw.trim().replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00213')) {
    cleaned = '0' + cleaned.slice(5);
  } else if (cleaned.startsWith('+213')) {
    cleaned = '0' + cleaned.slice(4);
  }
  return cleaned.replace(/[^0-9+]/g, '');
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, TASK_CONSTRAINTS.EMAIL_MAX);
}

export function isValidEmail(raw: string): boolean {
  const norm = normalizeEmail(raw);
  return norm.length > 0 && norm.length <= TASK_CONSTRAINTS.EMAIL_MAX && TASK_CONSTRAINTS.EMAIL_PATTERN.test(norm);
}

export function formatPhoneDisplay(phone: string): string {
  const norm = normalizePhone(phone);
  if (/^0[567]\d{8}$/.test(norm)) {
    return `${norm.slice(0, 4)} ${norm.slice(4, 6)} ${norm.slice(6, 8)} ${norm.slice(8, 10)}`;
  }
  return phone;
}

export async function deriveCredentialId(
  normalizedPhone: string,
  accessCode: string
): Promise<string> {
  const payload = `${normalizedPhone}:${accessCode.trim()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `cred_${hex}`;
}

export function generateRandomAccessCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = 100000 + (array[0] % 900000);
  return String(code);
}

export function sanitizeExternalUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null;
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString().slice(0, TASK_CONSTRAINTS.LIEN_MAX);
  } catch {
    return null;
  }
}

export function generateNextTaskId(tasks: TaskRecord[]): string {
  let maxNum = 0;
  for (const t of tasks) {
    const match = /^T-(\d+)$/i.exec(t.ID_Tache.trim());
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `T-${String(next).padStart(3, '0')}`;
}

export const SHEETS_HEADERS = [
  'ID_Tache',
  'Titre_Projet',
  'Style_Montage',
  'Duree_Video',
  'Deadline',
  'Prix_DZD',
  'Statut',
  'Monteur_Valide_Tel',
  'Monteur_Valide_Nom',
  'Lien_Fichiers',
  'Visibilite',
  'Monteurs_Autorises',
] as const;

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildTasksCSV(tasks: TaskRecord[]): string {
  const lines = [
    SHEETS_HEADERS.join(','),
    ...tasks.map((task) =>
      [
        task.ID_Tache,
        task.Titre_Projet,
        task.Style_Montage,
        task.Duree_Video,
        task.Deadline,
        task.Prix_DZD,
        task.Statut,
        task.Monteur_Valide_Email,
        task.Monteur_Valide_Nom,
        task.Lien_Fichiers,
        task.Visibilite ?? 'Tous',
        (task.Monteurs_Autorises ?? []).join('|'),
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function buildTasksTSV(tasks: TaskRecord[]): string {
  const cleanCell = (v: string | number) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
  const lines = [
    SHEETS_HEADERS.join('\t'),
    ...tasks.map((task) =>
      [
        task.ID_Tache,
        task.Titre_Projet,
        task.Style_Montage,
        task.Duree_Video,
        task.Deadline,
        task.Prix_DZD,
        task.Statut,
        task.Monteur_Valide_Email,
        task.Monteur_Valide_Nom,
        task.Lien_Fichiers,
        task.Visibilite ?? 'Tous',
        (task.Monteurs_Autorises ?? []).join('|'),
      ]
        .map(cleanCell)
        .join('\t')
    ),
  ];
  return lines.join('\n');
}

export interface ParsedCsvTask {
  ID_Tache: string;
  Titre_Projet: string;
  Style_Montage: string;
  Duree_Video: string;
  Deadline: string;
  Prix_DZD: number;
  Statut: TaskStatus;
  Monteur_Valide_Email: string;
  Monteur_Valide_Nom: string;
  Lien_Fichiers: string;
  Visibilite: 'Tous' | 'Selection';
  Monteurs_Autorises: string[];
}

function splitCsvRows(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const firstLine = cleaned.split(/\r?\n/)[0] || '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }
  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c !== '')) rows.push(currentRow);
  return rows;
}

export function parseTasksCSV(csvText: string): { tasks: ParsedCsvTask[]; errors: string[] } {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return {
      tasks: [],
      errors: ['Le fichier CSV doit contenir une ligne d’en-tête et au moins une mission.'],
    };
  }

  const headerMap = new Map<string, number>();
  rows[0].forEach((col, idx) => {
    headerMap.set(col.trim(), idx);
  });

  const requiredCols = ['ID_Tache', 'Titre_Projet', 'Prix_DZD', 'Lien_Fichiers'];
  for (const col of requiredCols) {
    if (!headerMap.has(col)) {
      return {
        tasks: [],
        errors: [`Colonne obligatoire manquante dans le CSV : "${col}".`],
      };
    }
  }

  const getCol = (row: string[], name: string) => {
    const idx = headerMap.get(name);
    return idx !== undefined ? (row[idx] ?? '').trim() : '';
  };

  const tasks: ParsedCsvTask[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const idTache = getCol(row, 'ID_Tache')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, TASK_CONSTRAINTS.ID_TACHE_MAX);
    const titre = getCol(row, 'Titre_Projet').slice(0, TASK_CONSTRAINTS.TITRE_MAX);
    const style = (getCol(row, 'Style_Montage') || 'Reels / Dynamique').slice(
      0,
      TASK_CONSTRAINTS.STYLE_MAX
    );
    const duree = (getCol(row, 'Duree_Video') || '01:00').slice(0, TASK_CONSTRAINTS.DUREE_MAX);
    const rawDeadline = getCol(row, 'Deadline');
    const deadline = TASK_CONSTRAINTS.DEADLINE_PATTERN.test(rawDeadline)
      ? rawDeadline
      : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const rawPrice = getCol(row, 'Prix_DZD').replace(/[^\d]/g, '');
    const prix = rawPrice ? parseInt(rawPrice, 10) : 0;

    const safeUrl = sanitizeExternalUrl(getCol(row, 'Lien_Fichiers'));
    if (!idTache || idTache.length < 2 || !titre || titre.length < 2 || !safeUrl) {
      errors.push(`Ligne ${rowNum} ignorée : ID, titre ou lien Google Drive invalide.`);
      continue;
    }

    const rawTel = getCol(row, 'Monteur_Valide_Tel') || getCol(row, 'Monteur_Valide_Email');
    const rawNom = getCol(row, 'Monteur_Valide_Nom');
    const rawTargets = getCol(row, 'Monteurs_Autorises')
      .split(/[|,]/)
      .map((p) => normalizePhone(p))
      .filter((p) => p.length >= TASK_CONSTRAINTS.PHONE_MIN)
      .slice(0, TASK_CONSTRAINTS.MAX_TARGET_MONTEURS);
    const rawVis = getCol(row, 'Visibilite');
    const visibilite: 'Tous' | 'Selection' =
      rawVis === 'Selection' && rawTargets.length > 0 ? 'Selection' : 'Tous';

    tasks.push({
      ID_Tache: idTache,
      Titre_Projet: titre,
      Style_Montage: style,
      Duree_Video: duree,
      Deadline: deadline,
      Prix_DZD: Math.min(Math.max(0, prix), TASK_CONSTRAINTS.PRIX_MAX),
      Statut: 'Ouverte',
      Monteur_Valide_Email: rawTel.slice(0, 254),
      Monteur_Valide_Nom: rawNom.slice(0, 120),
      Lien_Fichiers: safeUrl,
      Visibilite: visibilite,
      Monteurs_Autorises: visibilite === 'Selection' ? rawTargets : [],
    });
  }

  return { tasks, errors };
}

export const DEMO_SEED_TASKS: Omit<
  TaskRecord,
  'id' | 'createdAt' | 'updatedAt'
>[] = [
  {
    ID_Tache: 'T-001',
    Titre_Projet: 'Campagne Lancement Smartphone — Reels Instagram',
    Style_Montage: 'Reels / Dynamique',
    Duree_Video: '00:45',
    Deadline: '2026-12-02',
    Prix_DZD: 6500,
    Statut: 'Ouverte',
    Monteur_Valide_Email: '',
    Monteur_Valide_Nom: '',
    Monteur_Cred_Id: '',
    Lien_Fichiers: 'https://drive.google.com/drive/folders/1demo-reels-dz-001',
    Visibilite: 'Tous',
    Monteurs_Autorises: [],
    Ouverte_Pour_Tous: true,
    Claim_Deadline_Ms: 0,
    WhatsApp_Contacte: false,
    Chef_Monteur_Confirme: false,
  },
  {
    ID_Tache: 'T-002',
    Titre_Projet: 'Aftermovie Conférence Tech Alger 2026',
    Style_Montage: 'Cinématique',
    Duree_Video: '02:30',
    Deadline: '2026-12-06',
    Prix_DZD: 19500,
    Statut: 'Ouverte',
    Monteur_Valide_Email: '',
    Monteur_Valide_Nom: '',
    Monteur_Cred_Id: '',
    Lien_Fichiers: 'https://drive.google.com/drive/folders/1demo-aftermovie-002',
    Visibilite: 'Tous',
    Monteurs_Autorises: [],
    Ouverte_Pour_Tous: true,
    Claim_Deadline_Ms: 0,
    WhatsApp_Contacte: false,
    Chef_Monteur_Confirme: false,
  },
  {
    ID_Tache: 'T-003',
    Titre_Projet: 'Vlog Découverte Oran — Épisode 4',
    Style_Montage: 'Vlog',
    Duree_Video: '12:15',
    Deadline: '2026-12-10',
    Prix_DZD: 14000,
    Statut: 'Ouverte',
    Monteur_Valide_Email: '',
    Monteur_Valide_Nom: '',
    Monteur_Cred_Id: '',
    Lien_Fichiers: 'https://drive.google.com/drive/folders/1demo-vlog-oran-003',
    Visibilite: 'Tous',
    Monteurs_Autorises: [],
    Ouverte_Pour_Tous: true,
    Claim_Deadline_Ms: 0,
    WhatsApp_Contacte: false,
    Chef_Monteur_Confirme: false,
  },
  {
    ID_Tache: 'T-004',
    Titre_Projet: 'Highlights Tournoi Valorant Maghreb',
    Style_Montage: 'Gaming',
    Duree_Video: '08:20',
    Deadline: '2026-12-14',
    Prix_DZD: 11000,
    Statut: 'Ouverte',
    Monteur_Valide_Email: '',
    Monteur_Valide_Nom: '',
    Monteur_Cred_Id: '',
    Lien_Fichiers: 'https://drive.google.com/drive/folders/1demo-gaming-004',
    Visibilite: 'Tous',
    Monteurs_Autorises: [],
    Ouverte_Pour_Tous: true,
    Claim_Deadline_Ms: 0,
    WhatsApp_Contacte: false,
    Chef_Monteur_Confirme: false,
  },
];
