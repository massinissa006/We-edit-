import { Timestamp } from 'firebase/firestore';

export const ADMIN_EMAIL = 'massinissa@bmsinformatique.com';
export const ADMIN_WHATSAPP_NUMBER = '97477097309';
export const ADMIN_WHATSAPP_DISPLAY = '+974 7709 7309';
export const CLAIM_WINDOW_MS = 5 * 60 * 1000;

export const WORKFLOW_STATUSES = [
  'Assigned',
  'In progress',
  'First draft delivered',
  'Reediting',
  'Delivered',
  'Done',
] as const;

export type AssignedWorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type TaskStatus = 'Ouverte' | AssignedWorkflowStatus;
export type TaskVisibility = 'Tous' | 'Selection';

export function normalizeTaskStatus(raw: string | undefined | null): TaskStatus {
  if (!raw || raw === 'Ouverte') return 'Ouverte';
  if (raw === 'En cours') return 'Assigned';
  if ((WORKFLOW_STATUSES as readonly string[]).includes(raw)) {
    return raw as AssignedWorkflowStatus;
  }
  return 'Assigned';
}

export function normalizeAssignedStatus(raw: string | undefined | null): AssignedWorkflowStatus {
  if (!raw || raw === 'En cours') return 'Assigned';
  if ((WORKFLOW_STATUSES as readonly string[]).includes(raw)) {
    return raw as AssignedWorkflowStatus;
  }
  return 'Assigned';
}

export const EDITING_STYLES = [
  'Reels / Dynamique',
  'Cinématique',
  'Vlog',
  'Gaming',
  'Documentaire',
  'Publicité / Ads',
  'Podcast / Talking Head',
] as const;

export const TASK_CONSTRAINTS = {
  ID_TACHE_MIN: 2,
  ID_TACHE_MAX: 32,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  TITRE_MIN: 2,
  TITRE_MAX: 160,
  STYLE_MIN: 2,
  STYLE_MAX: 80,
  DUREE_MIN: 1,
  DUREE_MAX: 20,
  DEADLINE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  PRIX_MAX: 100000000,
  LIEN_MIN: 8,
  LIEN_MAX: 1000,
  LIEN_PATTERN: /^https?:\/\/.*/i,
  MAX_HIDDEN_TASKS: 500,
  MAX_TARGET_MONTEURS: 50,
  PHONE_MIN: 6,
  PHONE_MAX: 32,
  CODE_MIN: 4,
  CODE_MAX: 32,
  EMAIL_MAX: 254,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

export interface TaskRecord {
  id: string;
  ID_Tache: string;
  Titre_Projet: string;
  Style_Montage: string;
  Duree_Video: string;
  Deadline: string;
  Prix_DZD: number;
  Statut: TaskStatus;
  Monteur_Valide_Email: string;
  Monteur_Valide_Nom: string;
  Monteur_Cred_Id: string;
  Lien_Fichiers: string;
  Visibilite?: TaskVisibility;
  Monteurs_Autorises?: string[];
  Ouverte_Pour_Tous?: boolean;
  Claim_Deadline_Ms?: number;
  WhatsApp_Contacte?: boolean;
  Chef_Monteur_Confirme?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface TaskInviteRecord {
  id: string;
  taskId: string;
  ID_Tache: string;
  Titre_Projet: string;
  Style_Montage: string;
  Duree_Video: string;
  Deadline: string;
  Prix_DZD: number;
  Lien_Fichiers: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AssignedMissionRecord {
  id: string;
  taskId: string;
  ID_Tache: string;
  Titre_Projet: string;
  Style_Montage: string;
  Duree_Video: string;
  Deadline: string;
  Prix_DZD: number;
  Statut: AssignedWorkflowStatus;
  Lien_Fichiers: string;
  Visibilite?: TaskVisibility;
  Claim_Deadline_Ms?: number;
  WhatsApp_Contacte?: boolean;
  Chef_Monteur_Confirme?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MonteurAccountRecord {
  id: string;
  nom: string;
  phone: string;
  email?: string;
  accessCode: string;
  credId: string;
  active: boolean;
  disponible?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MonteurSession {
  credId: string;
  phone: string;
  nom: string;
}

export interface MonteurNotificationItem {
  id: string;
  taskId: string;
  ID_Tache: string;
  Titre_Projet: string;
  Style_Montage: string;
  Prix_DZD: number;
  Deadline: string;
  Visibilite: TaskVisibility;
  receivedAtMs: number;
  read: boolean;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'info' | 'error';
  message: string;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}
