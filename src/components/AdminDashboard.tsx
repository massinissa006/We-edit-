import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileCheck2,
  Globe,
  KeyRound,
  Mail,
  MessageCircle,
  PackageCheck,
  PauseCircle,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AssignedWorkflowStatus,
  EDITING_STYLES,
  MonteurAccountRecord,
  normalizeTaskStatus,
  TASK_CONSTRAINTS,
  TaskRecord,
  TaskStatus,
  TaskVisibility,
  WORKFLOW_STATUSES,
} from '../types';
import {
  buildMonteurDirectWhatsAppUrl,
  buildMonteurMissionMailtoUrl,
  buildMonteurMissionWhatsAppUrl,
  buildTasksCSV,
  buildTasksTSV,
  formatCountdownMMSS,
  formatDateFR,
  formatDZD,
  formatPhoneDisplay,
  generateNextTaskId,
  generateRandomAccessCode,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  ParsedCsvTask,
  parseTasksCSV,
  sanitizeExternalUrl,
} from '../utils/formatters';

export type AdminSection = 'tableau' | 'nouvelle' | 'monteurs' | 'sync';

export interface TaskFormPayload {
  ID_Tache: string;
  Titre_Projet: string;
  Style_Montage: string;
  Duree_Video: string;
  Deadline: string;
  Prix_DZD: number;
  Lien_Fichiers: string;
  Visibilite: TaskVisibility;
  Monteurs_Autorises: string[];
}

export interface MonteurAccountFormPayload {
  nom: string;
  phone: string;
  email: string;
  accessCode: string;
}

export interface PendingEmailDispatch {
  idTache: string;
  titreProjet: string;
  styleMontage: string;
  dureeVideo: string;
  deadline: string;
  prixDZD: number;
  visibilite: TaskVisibility;
  recipients: { nom: string; email: string }[];
}

interface AdminDashboardProps {
  userEmail: string;
  activeSection: AdminSection;
  onSectionChange: (sec: AdminSection) => void;
  tasks: TaskRecord[];
  monteurs: MonteurAccountRecord[];
  loading: boolean;
  emailProviderConfigured: boolean | null;
  gmailConnected: boolean;
  onConnectGmail: () => Promise<void>;
  pendingEmailConfirm: PendingEmailDispatch | null;
  onConfirmEmailDispatch: (dispatch: PendingEmailDispatch) => Promise<void>;
  onDismissEmailConfirm: () => void;
  onCreateTask: (payload: TaskFormPayload, sendEmail?: boolean) => Promise<void>;
  onUpdateTask: (taskId: string, payload: TaskFormPayload) => Promise<void>;
  onConfirmChefMonteur: (task: TaskRecord) => Promise<void>;
  onChangeTaskStatus: (task: TaskRecord, status: AssignedWorkflowStatus) => Promise<void>;
  onReopenTask: (task: TaskRecord) => Promise<void>;
  onNotifyMonteurs: (task: TaskRecord) => Promise<void>;
  onDeleteTask: (task: TaskRecord) => Promise<void>;
  onCreateMonteur: (payload: MonteurAccountFormPayload) => Promise<void>;
  onUpdateMonteurEmail: (account: MonteurAccountRecord, email: string) => Promise<void>;
  onToggleMonteurActive: (account: MonteurAccountRecord) => Promise<void>;
  onRegenerateMonteurCode: (account: MonteurAccountRecord, newCode: string) => Promise<void>;
  onDeleteMonteur: (account: MonteurAccountRecord) => Promise<void>;
  onSeedDemoTasks: () => Promise<void>;
  onImportCsvTasks: (parsedTasks: ParsedCsvTask[]) => Promise<void>;
  onPreviewMonteur: () => void;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
}

function AdminStatusBadge({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'Done':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-[#05944F] border border-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Done
        </span>
      );
    case 'Delivered':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap">
          <PackageCheck className="w-3.5 h-3.5" />
          Delivered
        </span>
      );
    case 'Reediting':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5" />
          Reediting
        </span>
      );
    case 'First draft delivered':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
          <FileCheck2 className="w-3.5 h-3.5" />
          First draft delivered
        </span>
      );
    case 'In progress':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-[#1D4ED8] border border-blue-200 whitespace-nowrap">
          <Play className="w-3.5 h-3.5" />
          In progress
        </span>
      );
    case 'Assigned':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-orange-50 text-[#9A3412] border border-orange-200 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5" />
          Assigned
        </span>
      );
    case 'Ouverte':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200 whitespace-nowrap">
          Ouverte
        </span>
      );
  }
}

export function AdminDashboard({
  userEmail,
  activeSection,
  onSectionChange,
  tasks,
  monteurs,
  loading,
  emailProviderConfigured,
  gmailConnected,
  onConnectGmail,
  pendingEmailConfirm,
  onConfirmEmailDispatch,
  onDismissEmailConfirm,
  onCreateTask,
  onUpdateTask,
  onConfirmChefMonteur,
  onChangeTaskStatus,
  onReopenTask,
  onNotifyMonteurs,
  onDeleteTask,
  onCreateMonteur,
  onUpdateMonteurEmail,
  onToggleMonteurActive,
  onRegenerateMonteurCode,
  onDeleteMonteur,
  onSeedDemoTasks,
  onImportCsvTasks,
  onPreviewMonteur,
  onNotify,
}: AdminDashboardProps) {
  const defaultDeadline = useMemo(
    () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    []
  );

  // Task Form State
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [idTache, setIdTache] = useState(() => generateNextTaskId(tasks));
  const [titre, setTitre] = useState('');
  const [style, setStyle] = useState<string>(EDITING_STYLES[0]);
  const [duree, setDuree] = useState('01:00');
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [prix, setPrix] = useState('8000');
  const [lien, setLien] = useState('');
  const [visibilite, setVisibilite] = useState<TaskVisibility>('Tous');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [sendEmailOnCreate, setSendEmailOnCreate] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Monteur Account Form State
  const [mNom, setMNom] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mCode, setMCode] = useState(() => generateRandomAccessCode());
  const [monteurSubmitting, setMonteurSubmitting] = useState(false);
  const [monteurToEditEmail, setMonteurToEditEmail] = useState<MonteurAccountRecord | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    if (!editingTask && !titre && !lien) {
      setIdTache(generateNextTaskId(tasks));
    }
  }, [tasks, editingTask, titre, lien]);

  // Filters & Confirmations
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<TaskRecord | null>(null);
  const [taskToNotify, setTaskToNotify] = useState<TaskRecord | null>(null);
  const [notifyingTask, setNotifyingTask] = useState(false);
  const [sendingConfirmedEmails, setSendingConfirmedEmails] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [monteurToDelete, setMonteurToDelete] = useState<MonteurAccountRecord | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const hasPendingWhatsApp = useMemo(
    () =>
      tasks.some(
        (t) =>
          normalizeTaskStatus(t.Statut) === 'Assigned' &&
          t.WhatsApp_Contacte === false &&
          (t.Claim_Deadline_Ms ?? 0) > 0
      ),
    [tasks]
  );

  useEffect(() => {
    if (!hasPendingWhatsApp) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasPendingWhatsApp]);

  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvPreview, setCsvPreview] = useState<{
    tasks: ParsedCsvTask[];
    errors: string[];
  } | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);

  const availableMonteurs = useMemo(
    () => monteurs.filter((m) => m.active && m.disponible !== false),
    [monteurs]
  );

  const monteursWithEmailCount = useMemo(
    () => monteurs.filter((m) => m.active && isValidEmail(m.email ?? '')).length,
    [monteurs]
  );

  const sortedMonteursForAssignment = useMemo(() => {
    return [...monteurs].sort((a, b) => {
      const aAvail = a.active && a.disponible !== false ? 0 : a.active ? 1 : 2;
      const bAvail = b.active && b.disponible !== false ? 0 : b.active ? 1 : 2;
      if (aAvail !== bAvail) return aAvail - bAvail;
      return a.nom.localeCompare(b.nom);
    });
  }, [monteurs]);

  const pendingChefConfirmationTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          normalizeTaskStatus(t.Statut) === 'Assigned' &&
          t.WhatsApp_Contacte === true &&
          t.Chef_Monteur_Confirme !== true
      ),
    [tasks]
  );

  const monteurByPhone = useMemo(() => {
    const map = new Map<string, MonteurAccountRecord>();
    for (const m of monteurs) {
      map.set(normalizePhone(m.phone), m);
    }
    return map;
  }, [monteurs]);

  const kpis = useMemo(() => {
    let open = 0;
    let activeWorkflow = 0;
    let done = 0;
    let totalDoneDZD = 0;

    for (const t of tasks) {
      const st = normalizeTaskStatus(t.Statut);
      if (st === 'Ouverte') open++;
      else if (st === 'Done') {
        done++;
        totalDoneDZD += t.Prix_DZD;
      } else {
        activeWorkflow++;
      }
    }
    return { open, activeWorkflow, done, totalDoneDZD };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      const normalized = normalizeTaskStatus(t.Statut);
      if (statusFilter !== 'ALL' && normalized !== statusFilter) return false;
      if (q) {
        const hay = `${t.ID_Tache} ${t.Titre_Projet} ${t.Style_Montage} ${t.Monteur_Valide_Email} ${t.Monteur_Valide_Nom}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, searchQuery]);

  const resetForm = (nextTasks: TaskRecord[] = tasks) => {
    setEditingTask(null);
    setIdTache(generateNextTaskId(nextTasks));
    setTitre('');
    setStyle(EDITING_STYLES[0]);
    setDuree('01:00');
    setDeadline(defaultDeadline);
    setPrix('8000');
    setLien('');
    setVisibilite('Tous');
    setSelectedPhones([]);
  };

  const startEdit = (task: TaskRecord) => {
    setEditingTask(task);
    setIdTache(task.ID_Tache);
    setTitre(task.Titre_Projet);
    setStyle(task.Style_Montage);
    setDuree(task.Duree_Video);
    setDeadline(task.Deadline);
    setPrix(String(task.Prix_DZD));
    setLien(task.Lien_Fichiers);
    setVisibilite(task.Visibilite ?? 'Tous');
    setSelectedPhones(
      (task.Monteurs_Autorises ?? []).map((p) => normalizePhone(p)).filter(Boolean)
    );
    onSectionChange('nouvelle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleMonteurSelection = (phone: string) => {
    const norm = normalizePhone(phone);
    if (!norm) return;
    setSelectedPhones((prev) => {
      if (prev.includes(norm)) {
        return prev.filter((p) => p !== norm);
      }
      if (prev.length >= TASK_CONSTRAINTS.MAX_TARGET_MONTEURS) {
        onNotify(
          'error',
          `Maximum ${TASK_CONSTRAINTS.MAX_TARGET_MONTEURS} monteurs par mission ciblée.`
        );
        return prev;
      }
      return [...prev, norm];
    });
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = idTache.trim();
    const cleanTitre = titre.trim();
    const cleanStyle = style.trim();
    const cleanDuree = duree.trim();
    const cleanDeadline = deadline.trim();
    const cleanPrix = parseInt(prix, 10);
    const safeUrl = sanitizeExternalUrl(lien);

    if (!TASK_CONSTRAINTS.ID_PATTERN.test(cleanId) || cleanId.length < TASK_CONSTRAINTS.ID_TACHE_MIN) {
      onNotify('error', 'ID_Tache invalide (ex: T-001).');
      return;
    }
    if (cleanTitre.length < TASK_CONSTRAINTS.TITRE_MIN) {
      onNotify('error', 'Veuillez saisir un titre de projet.');
      return;
    }
    if (!TASK_CONSTRAINTS.DEADLINE_PATTERN.test(cleanDeadline)) {
      onNotify('error', 'Date limite invalide (AAAA-MM-JJ).');
      return;
    }
    if (!Number.isFinite(cleanPrix) || cleanPrix < 0 || cleanPrix > TASK_CONSTRAINTS.PRIX_MAX) {
      onNotify('error', 'Veuillez indiquer un montant valide en DZD.');
      return;
    }
    if (!safeUrl) {
      onNotify('error', 'Veuillez saisir une URL Google Drive valide (https://...).');
      return;
    }
    if (visibilite === 'Selection' && selectedPhones.length === 0) {
      onNotify('error', 'Veuillez sélectionner au moins un monteur ou choisir « Pour tout le monde ».');
      return;
    }

    const payload: TaskFormPayload = {
      ID_Tache: cleanId.slice(0, TASK_CONSTRAINTS.ID_TACHE_MAX),
      Titre_Projet: cleanTitre.slice(0, TASK_CONSTRAINTS.TITRE_MAX),
      Style_Montage: cleanStyle.slice(0, TASK_CONSTRAINTS.STYLE_MAX),
      Duree_Video: cleanDuree.slice(0, TASK_CONSTRAINTS.DUREE_MAX),
      Deadline: cleanDeadline,
      Prix_DZD: cleanPrix,
      Lien_Fichiers: safeUrl,
      Visibilite: visibilite,
      Monteurs_Autorises:
        visibilite === 'Selection'
          ? Array.from(new Set(selectedPhones)).slice(0, TASK_CONSTRAINTS.MAX_TARGET_MONTEURS)
          : [],
    };

    setFormSubmitting(true);
    try {
      if (editingTask) {
        await onUpdateTask(editingTask.id, payload);
      } else {
        await onCreateTask(payload, sendEmailOnCreate);
      }
      resetForm();
      onSectionChange('tableau');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleCreateMonteurSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNom = mNom.trim();
    const normPhone = normalizePhone(mPhone);
    const cleanEmail = normalizeEmail(mEmail);
    const cleanCode = mCode.trim();

    if (cleanNom.length < 2) {
      onNotify('error', 'Veuillez saisir le nom du monteur.');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      onNotify('error', 'Veuillez saisir une adresse e-mail valide pour le monteur.');
      return;
    }
    if (normPhone.length < TASK_CONSTRAINTS.PHONE_MIN) {
      onNotify('error', 'Numéro de téléphone invalide (minimum 6 chiffres).');
      return;
    }
    if (cleanCode.length < TASK_CONSTRAINTS.CODE_MIN) {
      onNotify('error', 'Le code d’accès doit contenir au moins 4 caractères.');
      return;
    }

    setMonteurSubmitting(true);
    try {
      await onCreateMonteur({
        nom: cleanNom.slice(0, 120),
        phone: normPhone.slice(0, 32),
        email: cleanEmail,
        accessCode: cleanCode.slice(0, 32),
      });
      setMNom('');
      setMPhone('');
      setMEmail('');
      setMCode(generateRandomAccessCode());
    } finally {
      setMonteurSubmitting(false);
    }
  };

  const handleSaveMonteurEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monteurToEditEmail) return;
    const cleanEmail = normalizeEmail(editEmailValue);
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      onNotify('error', 'Veuillez saisir une adresse e-mail valide.');
      return;
    }
    setSavingEmail(true);
    try {
      await onUpdateMonteurEmail(monteurToEditEmail, cleanEmail);
      setMonteurToEditEmail(null);
      setEditEmailValue('');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCopyCredentials = async (acc: MonteurAccountRecord) => {
    const text = `Accès Portail Monteurs Vidéo :\nIdentifiant (Téléphone) : ${formatPhoneDisplay(acc.phone)}\nCode d'accès : ${acc.accessCode}`;
    try {
      await navigator.clipboard.writeText(text);
      onNotify('success', `Identifiants de ${acc.nom} copiés dans le presse-papiers.`);
    } catch {
      onNotify('error', 'Impossible de copier les identifiants.');
    }
  };

  const handleStatusSelect = async (task: TaskRecord, nextStatus: AssignedWorkflowStatus) => {
    setBusyRowId(task.id);
    try {
      await onChangeTaskStatus(task, nextStatus);
    } finally {
      setBusyRowId(null);
    }
  };

  const handleConfirmMonteurRow = async (task: TaskRecord) => {
    setBusyRowId(task.id);
    try {
      await onConfirmChefMonteur(task);
    } finally {
      setBusyRowId(null);
    }
  };

  const handleDownloadCSV = () => {
    const csv = buildTasksCSV(tasks);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `portail_monteurs_missions_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('success', 'Export CSV compatible Google Sheets téléchargé.');
  };

  const handleCopyTSV = async () => {
    const tsv = buildTasksTSV(tasks);
    try {
      await navigator.clipboard.writeText(tsv);
      onNotify('success', 'Tableau copié ! Collez (Ctrl+V) dans votre feuille Google Sheets.');
    } catch {
      onNotify('error', 'Impossible de copier dans le presse-papiers.');
    }
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseTasksCSV(text);
    setCsvPreview(parsed);
    e.target.value = '';
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || csvPreview.tasks.length === 0) return;
    setImportingCsv(true);
    try {
      await onImportCsvTasks(csvPreview.tasks);
      setCsvPreview(null);
      onSectionChange('tableau');
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Deep Burnt Orange Admin Header */}
      <section className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#9A3412] mb-1">
              Console Administrateur · {userEmail}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
              Dispatch &amp; Suivi des missions
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {emailProviderConfigured === false && (
              <button
                type="button"
                disabled={connectingGmail}
                onClick={async () => {
                  setConnectingGmail(true);
                  try {
                    await onConnectGmail();
                  } finally {
                    setConnectingGmail(false);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                  gmailConnected
                    ? 'bg-emerald-50 text-[#05944F] border-emerald-200 hover:bg-emerald-100/70'
                    : 'bg-orange-50 text-[#9A3412] border-orange-200 hover:bg-orange-100/70'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                {connectingGmail
                  ? 'Connexion Gmail...'
                  : gmailConnected
                  ? 'Gmail connecté'
                  : 'Connecter Gmail'}
              </button>
            )}
            <button
              type="button"
              onClick={onPreviewMonteur}
              className="px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-[#F6F6F6] border border-neutral-200 rounded-lg hover:bg-neutral-200/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Espace Monteur
            </button>
            <button
              type="button"
              onClick={() => onSectionChange('monteurs')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Monteurs ({availableMonteurs.length} dispo / {monteurs.length})
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                onSectionChange(activeSection === 'nouvelle' ? 'tableau' : 'nouvelle');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {activeSection === 'nouvelle' && !editingTask
                ? 'Fermer'
                : 'Nouvelle mission'}
            </button>
          </div>
        </div>

        {/* 4-column KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-5 border-t border-neutral-200">
          <div>
            <p className="text-xs text-neutral-500">Missions ouvertes</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-neutral-900 mt-1">
              {kpis.open}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">En production (actives)</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#9A3412] mt-1">
              {kpis.activeWorkflow}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Terminées (Done)</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#05944F] mt-1">
              {kpis.done}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Total validé (Done)</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#05944F] mt-1">
              {formatDZD(kpis.totalDoneDZD)}
            </p>
          </div>
        </div>
      </section>

      {/* Section Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-neutral-200/80 rounded-xl">
          <button
            type="button"
            onClick={() => onSectionChange('tableau')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'tableau'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            Missions ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => onSectionChange('nouvelle')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'nouvelle'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            {editingTask ? `Modifier ${editingTask.ID_Tache}` : 'Publier une tâche'}
          </button>
          <button
            type="button"
            onClick={() => onSectionChange('monteurs')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'monteurs'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            Monteurs &amp; Codes ({monteurs.length})
          </button>
          <button
            type="button"
            onClick={() => onSectionChange('sync')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'sync'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            Export &amp; Sheets
          </button>
        </div>
      </div>

      {/* Section: Monteurs & Access Codes + Live Availability */}
      {activeSection === 'monteurs' && (
        <section
          aria-label="Gestion des monteurs et codes d'accès"
          className="space-y-6"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-xl font-bold text-neutral-900">
                  Créer un accès monteur
                </h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Le monteur se connecte avec son numéro de téléphone et son code d&apos;accès. Son
                  e-mail permet de l&apos;avertir automatiquement dès qu&apos;une mission est
                  disponible.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const link = `${window.location.origin}/?espace=monteur`;
                  void navigator.clipboard.writeText(link).then(
                    () => onNotify('success', 'Lien direct Espace Monteur copié !'),
                    () => onNotify('error', 'Impossible de copier le lien.')
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F6F6F6] border border-neutral-200 text-xs font-semibold text-neutral-900 hover:bg-neutral-200/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                Copier le lien Espace Monteur
              </button>
            </div>

            <form
              onSubmit={(e) => void handleCreateMonteurSubmit(e)}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
            >
              <div className="md:col-span-6 lg:col-span-3">
                <label
                  htmlFor="m-nom"
                  className="block text-xs font-semibold text-neutral-800 mb-1.5"
                >
                  Nom du monteur
                </label>
                <input
                  id="m-nom"
                  type="text"
                  required
                  value={mNom}
                  onChange={(e) => setMNom(e.target.value)}
                  placeholder="Ex : Karim Benali"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
                />
              </div>

              <div className="md:col-span-6 lg:col-span-3">
                <label
                  htmlFor="m-email"
                  className="block text-xs font-semibold text-neutral-800 mb-1.5"
                >
                  Adresse e-mail
                </label>
                <input
                  id="m-email"
                  type="email"
                  required
                  value={mEmail}
                  onChange={(e) => setMEmail(e.target.value)}
                  placeholder="karim@exemple.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
                />
              </div>

              <div className="md:col-span-4 lg:col-span-2">
                <label
                  htmlFor="m-phone"
                  className="block text-xs font-semibold text-neutral-800 mb-1.5"
                >
                  Téléphone
                </label>
                <input
                  id="m-phone"
                  type="tel"
                  required
                  value={mPhone}
                  onChange={(e) => setMPhone(e.target.value)}
                  placeholder="0550 12 34 56"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
                />
              </div>

              <div className="md:col-span-4 lg:col-span-2">
                <label
                  htmlFor="m-code"
                  className="block text-xs font-semibold text-neutral-800 mb-1.5"
                >
                  Code d&apos;accès
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="m-code"
                    type="text"
                    required
                    value={mCode}
                    onChange={(e) => setMCode(e.target.value)}
                    placeholder="482910"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
                  />
                  <button
                    type="button"
                    onClick={() => setMCode(generateRandomAccessCode())}
                    title="Générer un nouveau code"
                    className="p-2.5 rounded-lg bg-[#F6F6F6] border border-neutral-200 text-neutral-700 hover:text-[#9A3412] cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 lg:col-span-2">
                <button
                  type="submit"
                  disabled={monteurSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  {monteurSubmitting ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
            {monteurs.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="font-display text-base font-bold text-neutral-900">
                  Aucun monteur enregistré
                </p>
                <p className="text-sm text-neutral-600">
                  Créez votre premier monteur ci-dessus pour lui donner son numéro de téléphone
                  identifiant, son e-mail de notification et son code d&apos;accès.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-neutral-700">
                    Liste des monteurs ({monteurs.length})
                  </span>
                  <div className="flex flex-wrap items-center gap-3 tabular-nums">
                    <span className="font-semibold text-[#05944F]">
                      {availableMonteurs.length} disponible(s)
                    </span>
                    <span aria-hidden="true" className="text-neutral-300">
                      ·
                    </span>
                    <span className="font-semibold text-neutral-700">
                      {monteursWithEmailCount} avec e-mail
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                        <th className="py-3.5 px-4">Monteur</th>
                        <th className="py-3.5 px-4">Téléphone (Identifiant)</th>
                        <th className="py-3.5 px-4">E-mail</th>
                        <th className="py-3.5 px-4">Code d&apos;accès</th>
                        <th className="py-3.5 px-4">Disponibilité</th>
                        <th className="py-3.5 px-4">Accès</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-sm">
                      {monteurs.map((acc) => {
                        const isDispo = acc.disponible !== false;
                        const hasEmail = isValidEmail(acc.email ?? '');
                        return (
                          <tr key={acc.id} className="hover:bg-neutral-50/70">
                            <td className="py-3.5 px-4 font-display font-semibold text-neutral-900">
                              {acc.nom}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-neutral-800 whitespace-nowrap">
                              {(() => {
                                const waDirect = buildMonteurDirectWhatsAppUrl({
                                  monteurPhone: acc.phone,
                                  monteurNom: acc.nom,
                                });
                                if (!waDirect) {
                                  return (
                                    <span className="inline-flex items-center gap-1.5">
                                      <Phone className="w-3.5 h-3.5 text-neutral-400" />
                                      {formatPhoneDisplay(acc.phone)}
                                    </span>
                                  );
                                }
                                return (
                                  <a
                                    href={waDirect}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Contacter ${acc.nom} sur WhatsApp`}
                                    className="inline-flex items-center gap-1.5 text-neutral-800 hover:text-[#05944F] transition-colors group"
                                  >
                                    <Phone className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#05944F]" />
                                    <span className="underline decoration-neutral-300 underline-offset-2 group-hover:decoration-[#05944F]">
                                      {formatPhoneDisplay(acc.phone)}
                                    </span>
                                    <MessageCircle className="w-3.5 h-3.5 text-[#05944F]" />
                                  </a>
                                );
                              })()}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {hasEmail ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                  <span className="text-xs font-medium text-neutral-800">
                                    {acc.email}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMonteurToEditEmail(acc);
                                      setEditEmailValue(acc.email ?? '');
                                    }}
                                    title="Modifier l'e-mail"
                                    aria-label={`Modifier l'e-mail de ${acc.nom}`}
                                    className="p-1 rounded text-neutral-400 hover:text-[#9A3412] hover:bg-orange-50 cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMonteurToEditEmail(acc);
                                    setEditEmailValue('');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-orange-50 text-[#9A3412] border border-orange-200 hover:bg-orange-100 transition-colors cursor-pointer"
                                >
                                  <Mail className="w-3 h-3" />
                                  Ajouter un e-mail
                                </button>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-neutral-900 whitespace-nowrap">
                              {acc.accessCode}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isDispo ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-[#05944F] border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Disponible
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
                                  <PauseCircle className="w-3.5 h-3.5" />
                                  Non disponible
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => void onToggleMonteurActive(acc)}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer transition-colors ${
                                  acc.active
                                    ? 'bg-emerald-50 text-[#05944F] border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                                }`}
                              >
                                {acc.active ? 'Actif' : 'Désactivé'}
                              </button>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyCredentials(acc)}
                                  title="Copier les identifiants"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F6F6F6] border border-neutral-200 text-xs font-semibold text-neutral-800 hover:bg-neutral-200/70 cursor-pointer"
                                >
                                  <ClipboardCopy className="w-3.5 h-3.5" />
                                  Copier accès
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onRegenerateMonteurCode(acc, generateRandomAccessCode())
                                  }
                                  title="Régénérer un nouveau code"
                                  className="p-2 rounded-lg text-neutral-600 hover:text-[#9A3412] hover:bg-orange-50 cursor-pointer"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMonteurToDelete(acc)}
                                  title="Supprimer l'accès"
                                  className="p-2 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Section: Publish / Edit Task Form */}
      {activeSection === 'nouvelle' && (
        <section
          aria-label="Formulaire de publication de tâche"
          className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8"
        >
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-neutral-900">
                {editingTask
                  ? `Modifier la mission ${editingTask.ID_Tache}`
                  : 'Publier une nouvelle mission'}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                Consultez la disponibilité en direct des monteurs et choisissez l&apos;audience de
                la mission.
              </p>
            </div>
            {editingTask && (
              <button
                type="button"
                onClick={() => resetForm()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Annuler l&apos;édition
              </button>
            )}
          </div>

          <form onSubmit={(e) => void handleTaskSubmit(e)} className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-2">
              <label htmlFor="id-tache" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                ID_Tache
              </label>
              <input
                id="id-tache"
                type="text"
                required
                value={idTache}
                onChange={(e) => setIdTache(e.target.value)}
                placeholder="T-001"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>

            <div className="md:col-span-6">
              <label htmlFor="titre-projet" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Titre_Projet
              </label>
              <input
                id="titre-projet"
                type="text"
                required
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex : Campagne Reels Lancement Produit"
                className="w-full px-3 py-2.5 text-sm bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>

            <div className="md:col-span-4">
              <label htmlFor="style-montage" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Style_Montage
              </label>
              <select
                id="style-montage"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              >
                {EDITING_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="duree-video" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Duree_Video
              </label>
              <input
                id="duree-video"
                type="text"
                required
                value={duree}
                onChange={(e) => setDuree(e.target.value)}
                placeholder="01:30"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="deadline" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Deadline
              </label>
              <input
                id="deadline"
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="prix-dzd" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Prix_DZD (Dinars Algériens)
              </label>
              <input
                id="prix-dzd"
                type="number"
                min={0}
                step={100}
                required
                value={prix}
                onChange={(e) => setPrix(e.target.value)}
                placeholder="19500"
                className="w-full px-3 py-2.5 text-sm font-mono tabular-nums bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>

            <div className="md:col-span-4">
              <label htmlFor="lien-fichiers" className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Lien_Fichiers (URL Google Drive)
              </label>
              <input
                id="lien-fichiers"
                type="url"
                required
                value={lien}
                onChange={(e) => setLien(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-3 py-2.5 text-sm bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>

            {/* Audience / Visibility Selector + Live Monteur Availability */}
            <div className="md:col-span-12 pt-4 border-t border-neutral-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-neutral-800">
                    Visibilité &amp; Assignation de la mission
                  </p>
                  <p className="text-xs text-neutral-600">
                    <span className="font-semibold text-[#05944F] tabular-nums">
                      {availableMonteurs.length} monteur(s) disponible(s)
                    </span>{' '}
                    sur {monteurs.length}
                    {availableMonteurs.length > 0 && (
                      <span className="text-neutral-500">
                        {' '}
                        · {availableMonteurs.map((m) => m.nom).join(', ')}
                      </span>
                    )}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Visibilité de la mission"
                  className="inline-flex items-center gap-1 p-1 bg-neutral-200/80 rounded-xl self-start"
                >
                  <button
                    type="button"
                    onClick={() => setVisibilite('Tous')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      visibilite === 'Tous'
                        ? 'bg-[#9A3412] text-white'
                        : 'text-neutral-700 hover:text-[#9A3412]'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Pour tout le monde
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibilite('Selection')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      visibilite === 'Selection'
                        ? 'bg-[#9A3412] text-white'
                        : 'text-neutral-700 hover:text-[#9A3412]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Monteurs sélectionnés
                    {selectedPhones.length > 0 ? ` (${selectedPhones.length})` : ''}
                  </button>
                </div>
              </div>

              {visibilite === 'Selection' && (
                <div className="bg-[#F6F6F6] border border-neutral-200 rounded-xl p-4 space-y-3">
                  {monteurs.length === 0 ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-xs text-neutral-600">
                        Aucun monteur enregistré pour le moment. Créez d&apos;abord des profils
                        dans « Monteurs &amp; Codes ».
                      </p>
                      <button
                        type="button"
                        onClick={() => onSectionChange('monteurs')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#9A3412] text-white rounded-lg hover:bg-[#7C2D12] cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Créer un monteur
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-neutral-700 tabular-nums">
                          {selectedPhones.length} monteur(s) sélectionné(s) sur {monteurs.length}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPhones(
                                availableMonteurs
                                  .slice(0, TASK_CONSTRAINTS.MAX_TARGET_MONTEURS)
                                  .map((m) => normalizePhone(m.phone))
                                  .filter(Boolean)
                              )
                            }
                            className="text-xs font-semibold text-[#05944F] hover:underline cursor-pointer"
                          >
                            Tous les disponibles ({availableMonteurs.length})
                          </button>
                          <span aria-hidden="true" className="text-neutral-400">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPhones(
                                monteurs
                                  .filter((m) => m.active)
                                  .slice(0, TASK_CONSTRAINTS.MAX_TARGET_MONTEURS)
                                  .map((m) => normalizePhone(m.phone))
                                  .filter(Boolean)
                              )
                            }
                            className="text-xs font-semibold text-[#9A3412] hover:underline cursor-pointer"
                          >
                            Tous les actifs
                          </button>
                          <span aria-hidden="true" className="text-neutral-400">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedPhones([])}
                            className="text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:underline cursor-pointer"
                          >
                            Tout désélectionner
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {sortedMonteursForAssignment.map((m) => {
                          const normPhone = normalizePhone(m.phone);
                          const isChecked = selectedPhones.includes(normPhone);
                          const isDispo = m.disponible !== false;
                          const waDirect = buildMonteurDirectWhatsAppUrl({
                            monteurPhone: m.phone,
                            monteurNom: m.nom,
                          });
                          return (
                            <div
                              key={m.id}
                              role="checkbox"
                              aria-checked={isChecked}
                              tabIndex={0}
                              onClick={() => toggleMonteurSelection(m.phone)}
                              onKeyDown={(ev) => {
                                if (ev.key === ' ' || ev.key === 'Enter') {
                                  ev.preventDefault();
                                  toggleMonteurSelection(m.phone);
                                }
                              }}
                              className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                                isChecked
                                  ? 'bg-orange-50/50 border-[#9A3412] text-neutral-900'
                                  : 'bg-white/80 border-neutral-200 text-neutral-700 hover:border-orange-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">
                                  {m.nom}
                                  {!m.active && (
                                    <span className="ml-1.5 text-[11px] font-normal text-neutral-400">
                                      (Désactivé)
                                    </span>
                                  )}
                                </p>
                                <p className="font-mono text-[11px] text-neutral-500 mt-0.5 flex flex-wrap items-center gap-1">
                                  {waDirect ? (
                                    <a
                                      href={waDirect}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(ev) => ev.stopPropagation()}
                                      title={`Contacter ${m.nom} sur WhatsApp`}
                                      className="inline-flex items-center gap-1 text-neutral-700 hover:text-[#05944F] underline decoration-neutral-300 underline-offset-2 hover:decoration-[#05944F]"
                                    >
                                      {formatPhoneDisplay(m.phone)}
                                      <MessageCircle className="w-3 h-3 text-[#05944F]" />
                                    </a>
                                  ) : (
                                    <span>{formatPhoneDisplay(m.phone)}</span>
                                  )}
                                  <span aria-hidden="true" className="mx-0.5">
                                    ·
                                  </span>
                                  <span
                                    className={`font-sans font-semibold ${
                                      isDispo ? 'text-[#05944F]' : 'text-neutral-400'
                                    }`}
                                  >
                                    {isDispo ? 'Disponible' : 'Non disponible'}
                                  </span>
                                </p>
                                {isValidEmail(m.email ?? '') ? (
                                  <p className="text-[11px] text-neutral-500 truncate mt-0.5 flex items-center gap-1">
                                    <Mail className="w-3 h-3 text-neutral-400 shrink-0" />
                                    <span className="truncate">{m.email}</span>
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-amber-700 mt-0.5">
                                    Sans e-mail configuré
                                  </p>
                                )}
                              </div>
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                                  isChecked
                                    ? 'bg-[#9A3412] border-[#9A3412] text-white'
                                    : 'bg-white border-neutral-300 text-transparent'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {!editingTask && (
              <div className="md:col-span-12 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-200">
                <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-neutral-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendEmailOnCreate}
                    onChange={(e) => setSendEmailOnCreate(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 accent-[#9A3412] cursor-pointer"
                  />
                  <span>
                    {visibilite === 'Selection'
                      ? `Envoyer un e-mail uniquement aux ${
                          monteurs.filter(
                            (m) =>
                              m.active &&
                              selectedPhones.includes(normalizePhone(m.phone)) &&
                              isValidEmail(m.email ?? '')
                          ).length
                        } monteur(s) sélectionné(s) avec e-mail`
                      : `Envoyer un e-mail à tous les monteurs actifs (${monteursWithEmailCount} avec e-mail)`}
                  </span>
                </label>
                {emailProviderConfigured === false && sendEmailOnCreate && (
                  <span className="text-[11px] text-neutral-600">
                    {gmailConnected
                      ? `Envoi prêt via Gmail (${userEmail}) après confirmation.`
                      : 'Une fenêtre de confirmation vous permettra de connecter Gmail et d’envoyer les e-mails après publication.'}
                  </span>
                )}
              </div>
            )}

            <div className="md:col-span-12 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onSectionChange('tableau');
                }}
                className="px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {formSubmitting
                  ? 'Enregistrement...'
                  : editingTask
                  ? 'Mettre à jour'
                  : 'Publier la mission'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Section: CSV & Google Sheets Sync */}
      {activeSection === 'sync' && (
        <section
          aria-label="Export et synchronisation Google Sheets"
          className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 space-y-6"
        >
          <div>
            <h2 className="font-display text-xl font-bold text-neutral-900">
              Export &amp; Synchronisation Google Sheets / CSV
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Colonnes :{' '}
              <span className="font-mono text-xs text-neutral-700">
                ID_Tache, Titre_Projet, Style_Montage, Duree_Video, Deadline, Prix_DZD, Statut,
                Monteur_Valide_Tel, Monteur_Valide_Nom, Lien_Fichiers, Visibilite,
                Monteurs_Autorises
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadCSV}
              disabled={tasks.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exporter en CSV
            </button>

            <button
              type="button"
              onClick={() => void handleCopyTSV()}
              disabled={tasks.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ClipboardCopy className="w-4 h-4 text-[#05944F]" />
              Copier pour Google Sheets
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleCsvFileChange(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Importer depuis un CSV
            </button>

            <button
              type="button"
              onClick={() => void onSeedDemoTasks()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F6F6F6] text-neutral-800 text-sm font-medium hover:bg-neutral-200/70 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#9A3412]" />
              Ajouter 4 missions d&apos;exemple
            </button>
          </div>

          {csvPreview && (
            <div className="border border-neutral-200 rounded-xl p-5 bg-[#F6F6F6] space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-sm font-bold text-neutral-900">
                    Aperçu CSV : {csvPreview.tasks.length} mission(s) prête(s)
                  </h3>
                  {csvPreview.errors.length > 0 && (
                    <p className="text-xs text-red-600 mt-1">{csvPreview.errors.join(' ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCsvPreview(null)}
                    className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={importingCsv || csvPreview.tasks.length === 0}
                    onClick={() => void handleConfirmCsvImport()}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#05944F] rounded-lg hover:bg-emerald-800 cursor-pointer disabled:opacity-50"
                  >
                    {importingCsv ? 'Importation...' : 'Importer dans le portail'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Section: Tasks Dispatch Table */}
      {activeSection === 'tableau' && (
        <section className="space-y-4">
          {pendingChefConfirmationTasks.length > 0 && (
            <div className="bg-white border border-orange-200 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#9A3412]">
                    Confirmation chef monteur requise ({pendingChefConfirmationTasks.length})
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Ces monteurs ont envoyé leur message WhatsApp et attendent votre confirmation
                    pour débloquer le bouton « Commencer le montage ».
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendingChefConfirmationTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busyRowId === t.id}
                    onClick={() => void handleConfirmMonteurRow(t)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#05944F] text-white text-xs font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirmer {t.ID_Tache} ({t.Monteur_Valide_Nom || 'Monteur'})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer par ID, titre, style ou téléphone monteur..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#9A3412]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'Ouverte', ...WORKFLOW_STATUSES] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === st
                      ? 'bg-[#9A3412] text-white border-[#9A3412]'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:text-[#9A3412] hover:border-orange-300'
                  }`}
                >
                  {st === 'ALL' ? 'Toutes' : st}
                </button>
              ))}

              <button
                type="button"
                onClick={handleDownloadCSV}
                disabled={tasks.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-4">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-12 bg-neutral-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center space-y-4">
              <h2 className="font-display text-lg font-bold text-neutral-900">
                Aucune mission publiée pour le moment
              </h2>
              <p className="text-sm text-neutral-600 max-w-md mx-auto">
                Publiez votre première mission ou chargez 4 exemples pour tester l&apos;acceptation
                directe côté monteur.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onSectionChange('nouvelle')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Publier une mission
                </button>
                <button
                  type="button"
                  onClick={() => void onSeedDemoTasks()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-neutral-900 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#9A3412]" />
                  Charger 4 exemples
                </button>
              </div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center">
              <p className="text-sm text-neutral-600">
                Aucune mission ne correspond à votre filtre.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                      <th className="py-3.5 px-4 whitespace-nowrap">ID</th>
                      <th className="py-3.5 px-4">Mission &amp; Métadonnées</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Prix (DZD)</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">Statut</th>
                      <th className="py-3.5 px-4 min-w-[270px]">Monteur &amp; Gestion du statut</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 text-sm">
                    {filteredTasks.map((task) => {
                      const status = normalizeTaskStatus(task.Statut);
                      const isBusy = busyRowId === task.id;
                      const safeDriveUrl = sanitizeExternalUrl(task.Lien_Fichiers);
                      const assignedAccount = monteurByPhone.get(
                        normalizePhone(task.Monteur_Valide_Email)
                      );

                      return (
                        <tr
                          key={task.id}
                          className="hover:bg-neutral-50/70 transition-colors align-top"
                        >
                          <td className="py-4 px-4 font-mono text-xs font-semibold text-neutral-700 whitespace-nowrap">
                            {task.ID_Tache}
                          </td>

                          <td className="py-4 px-4">
                            <p className="font-display font-semibold text-neutral-900 leading-snug">
                              {task.Titre_Projet}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 mt-1">
                              <span>{task.Style_Montage}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{task.Duree_Video}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {formatDateFR(task.Deadline)}
                              </span>
                              <span aria-hidden="true">·</span>
                              {task.Visibilite === 'Selection' &&
                              (task.Monteurs_Autorises?.length ?? 0) > 0 ? (
                                <span className="font-medium text-[#9A3412]">
                                  Ciblée :{' '}
                                  {task.Monteurs_Autorises!.map((phone) => {
                                    const m = monteurByPhone.get(normalizePhone(phone));
                                    return m ? m.nom : formatPhoneDisplay(phone);
                                  }).join(', ')}
                                </span>
                              ) : (
                                <span>Pour tout le monde</span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 text-right font-mono tabular-nums font-bold text-[#05944F] whitespace-nowrap">
                            {formatDZD(task.Prix_DZD)}
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <AdminStatusBadge status={status} />
                          </td>

                          <td className="py-4 px-4">
                            {status === 'Ouverte' ? (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                <span>
                                  En attente d&apos;acceptation ·{' '}
                                  <span className="font-medium text-[#05944F]">
                                    {availableMonteurs.length} monteur(s) disponible(s)
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setTaskToNotify(task)}
                                  className="inline-flex items-center gap-1 font-semibold text-[#9A3412] hover:underline cursor-pointer"
                                >
                                  <Bell className="w-3 h-3" />
                                  Notifier
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                <div>
                                  <p className="text-xs font-semibold text-neutral-900">
                                    {task.Monteur_Valide_Nom || 'Monteur'}
                                    {assignedAccount && (
                                      <span
                                        className={`ml-1.5 font-medium ${
                                          assignedAccount.disponible !== false
                                            ? 'text-[#05944F]'
                                            : 'text-neutral-400'
                                        }`}
                                      >
                                        ·{' '}
                                        {assignedAccount.disponible !== false
                                          ? 'Disponible'
                                          : 'Non disponible'}
                                      </span>
                                    )}
                                  </p>
                                  {(() => {
                                    const waDirect = buildMonteurDirectWhatsAppUrl({
                                      monteurPhone: task.Monteur_Valide_Email,
                                      monteurNom: task.Monteur_Valide_Nom || assignedAccount?.nom,
                                      idTache: task.ID_Tache,
                                      titreProjet: task.Titre_Projet,
                                    });
                                    if (!waDirect) {
                                      return (
                                        <p className="font-mono text-xs text-neutral-600">
                                          {formatPhoneDisplay(task.Monteur_Valide_Email)}
                                        </p>
                                      );
                                    }
                                    return (
                                      <a
                                        href={waDirect}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Contacter ${
                                          task.Monteur_Valide_Nom || 'le monteur'
                                        } sur WhatsApp`}
                                        className="inline-flex items-center gap-1.5 font-mono text-xs text-neutral-700 hover:text-[#05944F] transition-colors mt-0.5 group"
                                      >
                                        <Phone className="w-3 h-3 text-neutral-400 group-hover:text-[#05944F]" />
                                        <span className="underline decoration-neutral-300 underline-offset-2 group-hover:decoration-[#05944F]">
                                          {formatPhoneDisplay(task.Monteur_Valide_Email)}
                                        </span>
                                        <MessageCircle className="w-3.5 h-3.5 text-[#05944F]" />
                                      </a>
                                    );
                                  })()}
                                  {status === 'Assigned' &&
                                    task.WhatsApp_Contacte !== true &&
                                    (task.Claim_Deadline_Ms ?? 0) > 0 && (
                                      <p className="text-xs font-medium text-[#D97706] mt-1 font-mono tabular-nums">
                                        Attente WhatsApp ·{' '}
                                        {formatCountdownMMSS((task.Claim_Deadline_Ms ?? 0) - nowMs)}
                                      </p>
                                    )}
                                  {status === 'Assigned' &&
                                    task.WhatsApp_Contacte === true &&
                                    task.Chef_Monteur_Confirme !== true && (
                                      <div className="mt-2 space-y-1.5">
                                        <p className="text-xs font-semibold text-[#9A3412]">
                                          WhatsApp envoyé · En attente de votre confirmation
                                        </p>
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => void handleConfirmMonteurRow(task)}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#05944F] text-white text-xs font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          {isBusy ? 'Confirmation...' : 'Confirmer pour démarrer'}
                                        </button>
                                      </div>
                                    )}
                                  {status === 'Assigned' &&
                                    task.WhatsApp_Contacte === true &&
                                    task.Chef_Monteur_Confirme === true && (
                                      <p className="text-xs font-medium text-[#05944F] mt-1">
                                        Confirmée par le chef monteur · Prêt à démarrer
                                      </p>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    aria-label={`Changer le statut de ${task.ID_Tache}`}
                                    disabled={isBusy}
                                    value={status}
                                    onChange={(e) =>
                                      void handleStatusSelect(
                                        task,
                                        e.target.value as AssignedWorkflowStatus
                                      )
                                    }
                                    className="px-2.5 py-1.5 text-xs font-semibold bg-[#F6F6F6] border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:bg-white focus:border-[#9A3412] cursor-pointer disabled:opacity-50"
                                  >
                                    {WORKFLOW_STATUSES.map((wfStatus) => (
                                      <option key={wfStatus} value={wfStatus}>
                                        {wfStatus}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void onReopenTask(task)}
                                    className="text-xs font-medium text-neutral-500 hover:text-[#9A3412] underline cursor-pointer"
                                  >
                                    Réouvrir
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {status === 'Ouverte' && (
                                <button
                                  type="button"
                                  onClick={() => setTaskToNotify(task)}
                                  title="Notifier les monteurs"
                                  aria-label="Notifier les monteurs"
                                  className="p-2 rounded-lg text-[#9A3412] hover:bg-orange-50 transition-colors cursor-pointer"
                                >
                                  <Bell className="w-4 h-4" />
                                </button>
                              )}
                              {safeDriveUrl && (
                                <a
                                  href={safeDriveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Ouvrir le lien Google Drive"
                                  className="p-2 rounded-lg text-neutral-500 hover:text-[#9A3412] hover:bg-orange-50 transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => startEdit(task)}
                                title="Modifier la mission"
                                className="p-2 rounded-lg text-neutral-500 hover:text-[#9A3412] hover:bg-orange-50 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTaskToDelete(task)}
                                title="Supprimer la mission"
                                className="p-2 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Notify Monteurs Modal */}
      {taskToNotify && (() => {
        const isTargeted = taskToNotify.Visibilite === 'Selection';
        const allowedPhoneSet = new Set(
          (taskToNotify.Monteurs_Autorises ?? []).map((p) => normalizePhone(p)).filter(Boolean)
        );
        const recipientMonteurs = isTargeted
          ? sortedMonteursForAssignment.filter(
              (m) => m.active && allowedPhoneSet.has(normalizePhone(m.phone))
            )
          : sortedMonteursForAssignment.filter((m) => m.active);
        const recipientsWithEmail = recipientMonteurs.filter((m) => isValidEmail(m.email ?? ''));
        const portalUrl = `${window.location.origin}/?espace=monteur`;

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notify-task-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 backdrop-blur-xs p-4"
          >
            <div className="bg-white border border-neutral-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#9A3412]">
                    Notification mission disponible
                  </p>
                  <h3
                    id="notify-task-title"
                    className="font-display text-lg font-bold text-neutral-900 mt-0.5"
                  >
                    {taskToNotify.ID_Tache} — {taskToNotify.Titre_Projet}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
                    {formatDZD(taskToNotify.Prix_DZD)} · Échéance {formatDateFR(taskToNotify.Deadline)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTaskToNotify(null)}
                  aria-label="Fermer"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-[#F6F6F6] border border-neutral-200 rounded-xl p-4 space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-neutral-900">
                    1. Alerte portail + E-mail automatique ({recipientsWithEmail.length} avec e-mail)
                  </p>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Envoie immédiatement une notification sur le portail (son + alerte navigateur){' '}
                    {recipientsWithEmail.length > 0
                      ? `et un e-mail depuis ${
                          emailProviderConfigured === true ? 'le serveur' : `Gmail (${userEmail})`
                        } ${
                          isTargeted
                            ? `uniquement aux ${recipientsWithEmail.length} monteur(s) sélectionné(s) disposant d’une adresse e-mail`
                            : `aux ${recipientsWithEmail.length} monteur(s) disposant d’une adresse e-mail`
                        }`
                      : isTargeted
                      ? `uniquement aux ${recipientMonteurs.length} monteur(s) sélectionné(s)`
                      : 'à tous les monteurs connectés'}
                    .
                  </p>
                  {isTargeted && (
                    <p className="text-[11px] font-semibold text-[#9A3412] bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                      Ciblage actif : seuls les monteurs sélectionnés pour cette tâche seront notifiés par e-mail.
                    </p>
                  )}
                  {recipientsWithEmail.length > 0 && (
                    <div className="text-[11px] text-neutral-700 bg-white border border-neutral-200 rounded-lg px-2.5 py-2 space-y-1 max-h-24 overflow-y-auto">
                      {recipientsWithEmail.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-neutral-900 truncate">{r.nom}</span>
                          <span className="font-mono text-neutral-500 truncate">{r.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {emailProviderConfigured === false && recipientsWithEmail.length > 0 && (
                    <p
                      className={`text-[11px] rounded-lg px-2.5 py-1.5 border ${
                        gmailConnected
                          ? 'text-[#05944F] bg-emerald-50 border-emerald-200'
                          : 'text-[#9A3412] bg-orange-50 border-orange-200'
                      }`}
                    >
                      {gmailConnected
                        ? `Prêt pour l’envoi via Gmail (${userEmail}).`
                        : 'Cliquez ci-dessous pour autoriser Gmail et envoyer les e-mails automatiquement.'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={notifyingTask}
                  onClick={async () => {
                    const target = taskToNotify;
                    setNotifyingTask(true);
                    try {
                      await onNotifyMonteurs(target);
                      setTaskToNotify(null);
                    } finally {
                      setNotifyingTask(false);
                    }
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Bell className="w-4 h-4" />
                  {notifyingTask
                    ? 'Envoi en cours...'
                    : emailProviderConfigured === false &&
                      !gmailConnected &&
                      recipientsWithEmail.length > 0
                    ? 'Autoriser Gmail & envoyer notification'
                    : 'Confirmer et envoyer notification & e-mail'}
                </button>
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-neutral-900">
                  2. Relance directe par E-mail ou WhatsApp ({recipientMonteurs.length})
                </p>
                {recipientMonteurs.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    Aucun monteur actif trouvé pour cette mission.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                    {recipientMonteurs.map((m) => {
                      const isDispo = m.disponible !== false;
                      const hasEmail = isValidEmail(m.email ?? '');
                      const waLink = buildMonteurMissionWhatsAppUrl({
                        monteurPhone: m.phone,
                        monteurNom: m.nom,
                        idTache: taskToNotify.ID_Tache,
                        titreProjet: taskToNotify.Titre_Projet,
                        prixDZD: taskToNotify.Prix_DZD,
                        deadline: taskToNotify.Deadline,
                      });
                      const mailtoLink = hasEmail
                        ? buildMonteurMissionMailtoUrl({
                            monteurEmail: m.email!,
                            monteurNom: m.nom,
                            idTache: taskToNotify.ID_Tache,
                            titreProjet: taskToNotify.Titre_Projet,
                            styleMontage: taskToNotify.Style_Montage,
                            dureeVideo: taskToNotify.Duree_Video,
                            prixDZD: taskToNotify.Prix_DZD,
                            deadline: taskToNotify.Deadline,
                            portalUrl,
                          })
                        : null;
                      return (
                        <div
                          key={m.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-900 truncate">
                              {m.nom}
                            </p>
                            <p className="text-[11px] text-neutral-500 font-mono flex flex-wrap items-center gap-1">
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Contacter ${m.nom} sur WhatsApp`}
                                className="inline-flex items-center gap-1 text-neutral-700 hover:text-[#05944F] underline decoration-neutral-300 underline-offset-2 hover:decoration-[#05944F]"
                              >
                                {formatPhoneDisplay(m.phone)}
                                <MessageCircle className="w-3 h-3 text-[#05944F]" />
                              </a>
                              <span aria-hidden="true" className="mx-0.5">
                                ·
                              </span>
                              <span
                                className={`font-sans font-semibold ${
                                  isDispo ? 'text-[#05944F]' : 'text-neutral-400'
                                }`}
                              >
                                {isDispo ? 'Disponible' : 'Non disponible'}
                              </span>
                            </p>
                            {hasEmail && (
                              <p className="text-[11px] text-neutral-500 truncate">
                                {m.email}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {mailtoLink && (
                              <a
                                href={mailtoLink}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F6F6F6] border border-neutral-200 text-neutral-900 text-xs font-semibold hover:bg-neutral-200/70 transition-colors whitespace-nowrap"
                              >
                                <Mail className="w-3 h-3 text-[#9A3412]" />
                                E-mail
                              </a>
                            )}
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#05944F] text-white text-xs font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap"
                            >
                              WhatsApp
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Task Confirmation Modal */}
      {taskToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 backdrop-blur-xs p-4"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 id="delete-task-title" className="font-display text-lg font-bold text-neutral-900">
              Supprimer la mission {taskToDelete.ID_Tache} ?
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Vous allez supprimer définitivement «{' '}
              <strong className="text-neutral-900">{taskToDelete.Titre_Projet}</strong> ». Cette action
              est irréversible.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = taskToDelete;
                  setTaskToDelete(null);
                  void onDeleteTask(target);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Monteur Email Modal */}
      {monteurToEditEmail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-monteur-email-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 backdrop-blur-xs p-4"
        >
          <form
            onSubmit={(e) => void handleSaveMonteurEmailSubmit(e)}
            className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="edit-monteur-email-title"
                  className="font-display text-lg font-bold text-neutral-900"
                >
                  E-mail de {monteurToEditEmail.nom}
                </h3>
                {(() => {
                  const waDirect = buildMonteurDirectWhatsAppUrl({
                    monteurPhone: monteurToEditEmail.phone,
                    monteurNom: monteurToEditEmail.nom,
                  });
                  if (!waDirect) {
                    return (
                      <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                        {formatPhoneDisplay(monteurToEditEmail.phone)}
                      </p>
                    );
                  }
                  return (
                    <a
                      href={waDirect}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Contacter ${monteurToEditEmail.nom} sur WhatsApp`}
                      className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-[#05944F] mt-0.5 font-mono underline decoration-neutral-300 underline-offset-2 hover:decoration-[#05944F]"
                    >
                      {formatPhoneDisplay(monteurToEditEmail.phone)}
                      <MessageCircle className="w-3.5 h-3.5 text-[#05944F]" />
                    </a>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => setMonteurToEditEmail(null)}
                aria-label="Fermer"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label
                htmlFor="edit-monteur-email-input"
                className="block text-xs font-semibold text-neutral-800 mb-1.5"
              >
                Adresse e-mail pour les alertes de nouvelles missions
              </label>
              <input
                id="edit-monteur-email-input"
                type="email"
                value={editEmailValue}
                onChange={(e) => setEditEmailValue(e.target.value)}
                placeholder="monteur@exemple.com"
                autoFocus
                className="w-full px-3.5 py-2.5 text-sm bg-[#F6F6F6] border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#9A3412]"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMonteurToEditEmail(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingEmail}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] cursor-pointer disabled:opacity-50"
              >
                {savingEmail ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Monteur Confirmation Modal */}
      {monteurToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-monteur-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 backdrop-blur-xs p-4"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 id="delete-monteur-title" className="font-display text-lg font-bold text-neutral-900">
              Supprimer l&apos;accès de {monteurToDelete.nom} ?
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Le numéro{' '}
              <span className="font-mono font-semibold text-neutral-900">
                {formatPhoneDisplay(monteurToDelete.phone)}
              </span>{' '}
              ne pourra plus se connecter au portail.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMonteurToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = monteurToDelete;
                  setMonteurToDelete(null);
                  void onDeleteMonteur(target);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Gmail / Email Confirmation Modal */}
      {pendingEmailConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-email-dispatch-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 backdrop-blur-xs p-4"
        >
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#9A3412]">
                  Confirmation d&apos;envoi d&apos;e-mail
                </p>
                <h3
                  id="confirm-email-dispatch-title"
                  className="font-display text-lg font-bold text-neutral-900 mt-0.5"
                >
                  {pendingEmailConfirm.idTache} — {pendingEmailConfirm.titreProjet}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
                  {formatDZD(pendingEmailConfirm.prixDZD)} · Échéance{' '}
                  {formatDateFR(pendingEmailConfirm.deadline)}
                </p>
              </div>
              <button
                type="button"
                disabled={sendingConfirmedEmails}
                onClick={onDismissEmailConfirm}
                aria-label="Fermer"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#F6F6F6] border border-neutral-200 rounded-xl p-4 space-y-2 text-xs text-neutral-700">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Expéditeur</span>
                <span className="font-semibold text-neutral-900 truncate">
                  Gmail ({userEmail})
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Audience</span>
                <span className="font-semibold text-[#9A3412]">
                  {pendingEmailConfirm.visibilite === 'Selection'
                    ? 'Monteurs sélectionnés uniquement'
                    : 'Tous les monteurs actifs'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">Destinataires</span>
                <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                  {pendingEmailConfirm.recipients.length} monteur(s)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-neutral-900">
                Liste des destinataires qui recevront l&apos;e-mail :
              </p>
              <div className="max-h-48 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                {pendingEmailConfirm.recipients.map((recipient) => (
                  <div
                    key={`${recipient.nom}-${recipient.email}`}
                    className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-semibold text-neutral-900 truncate">
                      {recipient.nom}
                    </span>
                    <span className="font-mono text-neutral-500 truncate">
                      {recipient.email}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!gmailConnected && emailProviderConfigured === false && (
              <p className="text-xs text-[#9A3412] bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                Une fenêtre Google va s&apos;ouvrir pour autoriser l&apos;envoi depuis votre compte
                Gmail ({userEmail}), puis les e-mails partiront immédiatement.
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={sendingConfirmedEmails}
                onClick={onDismissEmailConfirm}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={sendingConfirmedEmails}
                onClick={async () => {
                  const target = pendingEmailConfirm;
                  setSendingConfirmedEmails(true);
                  try {
                    await onConfirmEmailDispatch(target);
                  } finally {
                    setSendingConfirmedEmails(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sendingConfirmedEmails
                  ? 'Envoi en cours...'
                  : gmailConnected || emailProviderConfigured === true
                  ? `Confirmer et envoyer (${pendingEmailConfirm.recipients.length})`
                  : `Autoriser Gmail et envoyer (${pendingEmailConfirm.recipients.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
