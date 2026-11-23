import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  EyeOff,
  FileCheck2,
  Lock,
  MessageCircle,
  PackageCheck,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import {
  ADMIN_WHATSAPP_DISPLAY,
  AssignedMissionRecord,
  AssignedWorkflowStatus,
  EDITING_STYLES,
  MonteurNotificationItem,
  MonteurSession,
  normalizeAssignedStatus,
  TaskRecord,
  WORKFLOW_STATUSES,
} from '../types';
import {
  buildChefMonteurWhatsAppUrl,
  formatCountdownMMSS,
  formatDateFR,
  formatDZD,
  formatPhoneDisplay,
  formatTimestampFR,
  sanitizeExternalUrl,
} from '../utils/formatters';

export type MonteurTab = 'disponibles' | 'attribuees' | 'paiements';

interface MonteurDashboardProps {
  session: MonteurSession;
  disponible: boolean;
  onToggleDisponible: (nextDisponible: boolean) => Promise<void>;
  activeTab: MonteurTab;
  onTabChange: (tab: MonteurTab) => void;
  openTasks: TaskRecord[];
  assignedMissions: AssignedMissionRecord[];
  hiddenTaskIds: Set<string>;
  loading: boolean;
  notifications: MonteurNotificationItem[];
  unreadCount: number;
  soundEnabled: boolean;
  onToggleSound: (next: boolean) => void;
  browserPermission: NotificationPermission | 'unsupported';
  browserNotifEnabled: boolean;
  onEnableBrowserNotifications: () => Promise<void>;
  onMarkNotificationRead: (notifId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onClearNotifications: () => void;
  onClaimMission: (task: TaskRecord) => Promise<void>;
  onStartEditing: (mission: AssignedMissionRecord) => Promise<void>;
  onHideMission: (taskId: string) => Promise<void>;
  onRestoreHiddenMissions: () => Promise<void>;
  onConfirmWhatsAppContact: (mission: AssignedMissionRecord) => Promise<void>;
  onExpireUnconfirmedClaim: (mission: AssignedMissionRecord) => Promise<void>;
}

function MissionStatusBadge({ status }: { status: AssignedWorkflowStatus }) {
  switch (status) {
    case 'Done':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-[#05944F] border border-emerald-200 whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Done · Créditée
        </span>
      );
    case 'Delivered':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap shrink-0">
          <PackageCheck className="w-3.5 h-3.5" />
          Delivered
        </span>
      );
    case 'Reediting':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          Reediting
        </span>
      );
    case 'First draft delivered':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap shrink-0">
          <FileCheck2 className="w-3.5 h-3.5" />
          First draft delivered
        </span>
      );
    case 'In progress':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-[#1D4ED8] border border-blue-200 whitespace-nowrap shrink-0">
          <Play className="w-3.5 h-3.5" />
          In progress
        </span>
      );
    case 'Assigned':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-orange-50 text-[#9A3412] border border-orange-200 whitespace-nowrap shrink-0">
          <UserCheck className="w-3.5 h-3.5" />
          Assigned
        </span>
      );
  }
}

export function MonteurDashboard({
  session,
  disponible,
  onToggleDisponible,
  activeTab,
  onTabChange,
  openTasks,
  assignedMissions,
  hiddenTaskIds,
  loading,
  notifications,
  unreadCount,
  soundEnabled,
  onToggleSound,
  browserPermission,
  browserNotifEnabled,
  onEnableBrowserNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearNotifications,
  onClaimMission,
  onStartEditing,
  onHideMission,
  onRestoreHiddenMissions,
  onConfirmWhatsAppContact,
  onExpireUnconfirmedClaim,
}: MonteurDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState<string>('ALL');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [busyAvailability, setBusyAvailability] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const pendingWhatsAppMissions = useMemo(
    () =>
      assignedMissions.filter((m) => {
        const st = normalizeAssignedStatus(m.Statut);
        return (
          st === 'Assigned' &&
          m.WhatsApp_Contacte === false &&
          (m.Claim_Deadline_Ms ?? 0) > 0
        );
      }),
    [assignedMissions]
  );

  useEffect(() => {
    if (pendingWhatsAppMissions.length === 0) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [pendingWhatsAppMissions.length]);

  useEffect(() => {
    for (const mission of pendingWhatsAppMissions) {
      if ((mission.Claim_Deadline_Ms ?? 0) > 0 && nowMs >= (mission.Claim_Deadline_Ms ?? 0)) {
        void onExpireUnconfirmedClaim(mission);
      }
    }
  }, [nowMs, pendingWhatsAppMissions, onExpireUnconfirmedClaim]);

  const { totalEarningsDZD, doneCount, activeCount } = useMemo(() => {
    let total = 0;
    let done = 0;
    let active = 0;

    for (const mission of assignedMissions) {
      const st = normalizeAssignedStatus(mission.Statut);
      if (st === 'Done') {
        total += mission.Prix_DZD;
        done += 1;
      } else {
        active += 1;
      }
    }

    return {
      totalEarningsDZD: total,
      doneCount: done,
      activeCount: active,
    };
  }, [assignedMissions]);

  const visibleOpenTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return openTasks.filter((task) => {
      if (task.Statut !== 'Ouverte') return false;
      if (hiddenTaskIds.has(task.id)) return false;
      if (styleFilter !== 'ALL' && task.Style_Montage !== styleFilter) return false;
      if (q) {
        const hay = `${task.ID_Tache} ${task.Titre_Projet} ${task.Style_Montage}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [openTasks, hiddenTaskIds, styleFilter, searchQuery]);

  const sortedAssignedMissions = useMemo(() => {
    return [...assignedMissions].sort((a, b) => {
      const stA = normalizeAssignedStatus(a.Statut);
      const stB = normalizeAssignedStatus(b.Statut);
      if ((stA === 'Done') === (stB === 'Done')) {
        return a.Deadline.localeCompare(b.Deadline);
      }
      return stA === 'Done' ? 1 : -1;
    });
  }, [assignedMissions]);

  const paymentHistoryRows = useMemo(() => {
    const doneOnly = assignedMissions.filter(
      (m) => normalizeAssignedStatus(m.Statut) === 'Done'
    );
    const chronological = [...doneOnly].sort((a, b) => {
      const msA = a.updatedAt?.toMillis?.() ?? 0;
      const msB = b.updatedAt?.toMillis?.() ?? 0;
      if (msA !== msB) return msA - msB;
      return a.Deadline.localeCompare(b.Deadline);
    });
    let running = 0;
    const withCumulative = chronological.map((mission) => {
      running += mission.Prix_DZD;
      return {
        mission,
        cumulativeDZD: running,
      };
    });
    return withCumulative.reverse();
  }, [assignedMissions]);

  const hiddenOpenCount = useMemo(() => {
    return openTasks.filter((t) => t.Statut === 'Ouverte' && hiddenTaskIds.has(t.id)).length;
  }, [openTasks, hiddenTaskIds]);

  const openTaskMap = useMemo(() => {
    const map = new Map<string, TaskRecord>();
    for (const t of openTasks) {
      if (t.Statut === 'Ouverte' && !hiddenTaskIds.has(t.id)) {
        map.set(t.id, t);
      }
    }
    return map;
  }, [openTasks, hiddenTaskIds]);

  const unreadTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of notifications) {
      if (!n.read) set.add(n.taskId);
    }
    return set;
  }, [notifications]);

  const handleAvailabilityChange = async (next: boolean) => {
    if (next === disponible || busyAvailability) return;
    setBusyAvailability(true);
    try {
      await onToggleDisponible(next);
    } finally {
      setBusyAvailability(false);
    }
  };

  const handleClaim = async (task: TaskRecord) => {
    setBusyTaskId(task.id);
    try {
      await onClaimMission(task);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleStart = async (mission: AssignedMissionRecord) => {
    if (mission.WhatsApp_Contacte !== true || mission.Chef_Monteur_Confirme !== true) return;
    setBusyTaskId(mission.taskId);
    try {
      await onStartEditing(mission);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleHide = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      await onHideMission(taskId);
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Deep Burnt Orange Earnings & Availability Summary Card */}
      <section className="bg-[#9A3412] text-white rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-orange-100/90">Espace Monteur</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Bonjour, {session.nom}
              </h1>
              <p className="text-sm text-orange-100/90">
                Identifiant téléphone :{' '}
                <span className="font-mono text-white font-semibold">
                  {formatPhoneDisplay(session.phone)}
                </span>
              </p>
            </div>

            {/* Availability Toggle Control */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="text-xs font-medium text-orange-100/90">
                Ma disponibilité :
              </span>
              <div
                role="group"
                aria-label="Disponibilité pour de nouvelles missions"
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#7C2D12]"
              >
                <button
                  type="button"
                  disabled={busyAvailability}
                  aria-pressed={disponible}
                  onClick={() => void handleAvailabilityChange(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                    disponible
                      ? 'bg-[#05944F] text-white'
                      : 'text-orange-100 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Disponible
                </button>
                <button
                  type="button"
                  disabled={busyAvailability}
                  aria-pressed={!disponible}
                  onClick={() => void handleAvailabilityChange(false)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                    !disponible
                      ? 'bg-white text-[#7C2D12]'
                      : 'text-orange-100 hover:text-white'
                  }`}
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  Non disponible
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#7C2D12]">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-orange-100/90">Total des gains validés</p>
              <p
                data-testid="earnings-counter"
                className="font-mono tabular-nums text-3xl sm:text-4xl font-bold text-white tracking-tight"
              >
                {formatDZD(totalEarningsDZD)}
              </p>
              <p className="text-xs text-orange-100/90 mt-1 tabular-nums">
                {doneCount} {doneCount > 1 ? 'missions terminées' : 'mission terminée'}
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                {activeCount} {activeCount > 1 ? 'missions actives' : 'mission active'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Real-time Mission Notification Controls & Collapsible Center */}
      <section aria-label="Notifications de missions" className="space-y-3">
        <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowNotifications((prev) => !prev)}
              aria-expanded={showNotifications}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                unreadCount > 0
                  ? 'bg-orange-50 border-orange-300 text-[#9A3412] hover:bg-orange-100/70'
                  : 'bg-[#F6F6F6] border-neutral-200 text-neutral-800 hover:bg-neutral-200/70'
              }`}
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span>
                Notifications{unreadCount > 0 ? ` (${unreadCount} non lue${unreadCount > 1 ? 's' : ''})` : ''}
              </span>
            </button>

            {unreadCount > 0 && !showNotifications && (
              <span className="text-xs text-neutral-600">
                Nouvelle mission prête à être acceptée
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleSound(!soundEnabled)}
              aria-pressed={soundEnabled}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                soundEnabled
                  ? 'bg-white border-neutral-200 text-neutral-800 hover:border-orange-300'
                  : 'bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-[#9A3412]" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>{soundEnabled ? 'Son activé' : 'Son coupé'}</span>
            </button>

            {browserPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={() => void onEnableBrowserNotifications()}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  browserPermission === 'granted' && browserNotifEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-[#05944F] hover:bg-emerald-100/70'
                    : browserPermission === 'denied'
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-500 cursor-not-allowed'
                    : 'bg-[#9A3412] border-[#9A3412] text-white hover:bg-[#7C2D12]'
                }`}
              >
                {browserPermission === 'denied' ? (
                  <BellOff className="w-3.5 h-3.5" />
                ) : (
                  <BellRing className="w-3.5 h-3.5" />
                )}
                <span>
                  {browserPermission === 'granted'
                    ? browserNotifEnabled
                      ? 'Alertes navigateur actives'
                      : 'Alertes navigateur en pause'
                    : browserPermission === 'denied'
                    ? 'Alertes bloquées'
                    : 'Activer alertes navigateur'}
                </span>
              </button>
            )}
          </div>
        </div>

        {showNotifications && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100">
              <p className="font-display text-sm font-bold text-neutral-900">
                Centre de notifications ({notifications.length})
              </p>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllNotificationsRead}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#9A3412] hover:underline cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Tout marquer lu
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearNotifications}
                    className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Effacer
                  </button>
                )}
              </div>
            </div>

            {notifications.length === 0 ? (
              <p className="text-sm text-neutral-500 py-3 text-center">
                Aucune notification reçue pour le moment. Dès qu&apos;une mission devient disponible,
                vous serez averti ici en direct.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 max-h-80 overflow-y-auto">
                {notifications.map((notif) => {
                  const liveTask = openTaskMap.get(notif.taskId);
                  const timeLabel = new Intl.DateTimeFormat('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(notif.receivedAtMs);

                  return (
                    <div
                      key={notif.id}
                      className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !notif.read ? 'bg-orange-50/40 -mx-2 px-2 rounded-lg' : ''
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <span className="font-mono font-semibold text-neutral-800">
                            {notif.ID_Tache}
                          </span>
                          <span aria-hidden="true" className="text-neutral-300">
                            ·
                          </span>
                          <span className="font-mono tabular-nums font-bold text-[#05944F]">
                            {formatDZD(notif.Prix_DZD)}
                          </span>
                          <span aria-hidden="true" className="text-neutral-300">
                            ·
                          </span>
                          <span className="font-mono tabular-nums text-neutral-500">
                            {timeLabel}
                          </span>
                          {!notif.read && (
                            <>
                              <span aria-hidden="true" className="text-neutral-300">
                                ·
                              </span>
                              <span className="font-semibold text-[#9A3412]">Nouvelle</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-neutral-900 truncate">
                          {notif.Titre_Projet}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {notif.Style_Montage}
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          {liveTask ? (
                            <span className="font-medium text-[#05944F]">Toujours disponible</span>
                          ) : (
                            <span>Déjà attribuée ou clôturée</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {liveTask ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onMarkNotificationRead(notif.id);
                                onTabChange('disponibles');
                                setShowNotifications(false);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-[#F6F6F6] border border-neutral-200 rounded-lg hover:bg-neutral-200/70 transition-colors cursor-pointer"
                            >
                              Consulter
                            </button>
                            <button
                              type="button"
                              disabled={busyTaskId === liveTask.id}
                              onClick={() => {
                                onMarkNotificationRead(notif.id);
                                void handleClaim(liveTask);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Accepter
                            </button>
                          </>
                        ) : (
                          !notif.read && (
                            <button
                              type="button"
                              onClick={() => onMarkNotificationRead(notif.id)}
                              className="px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 cursor-pointer"
                            >
                              Marquer lu
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Segmented Navigation + Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div
          role="tablist"
          aria-label="Navigation des missions"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-neutral-200/80 rounded-xl self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'disponibles'}
            onClick={() => onTabChange('disponibles')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'disponibles'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            Missions disponibles ({visibleOpenTasks.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'attribuees'}
            onClick={() => onTabChange('attribuees')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'attribuees'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            Mes missions ({sortedAssignedMissions.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'paiements'}
            onClick={() => onTabChange('paiements')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'paiements'
                ? 'bg-[#9A3412] text-white'
                : 'text-neutral-700 hover:text-[#9A3412]'
            }`}
          >
            Historique des paiements ({paymentHistoryRows.length})
          </button>
        </div>

        {activeTab === 'disponibles' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une mission..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#9A3412]"
              />
            </div>

            <select
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value)}
              aria-label="Filtrer par style de montage"
              className="px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:border-[#9A3412]"
            >
              <option value="ALL">Tous les styles</option>
              {EDITING_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>

            {hiddenOpenCount > 0 && (
              <button
                type="button"
                onClick={() => void onRestoreHiddenMissions()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:text-[#9A3412] hover:bg-orange-50/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réafficher {hiddenOpenCount} masquée(s)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-neutral-200 rounded-xl p-6 h-56 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-4 w-28 bg-neutral-200 rounded" />
                <div className="h-6 w-3/4 bg-neutral-200 rounded" />
                <div className="h-4 w-1/2 bg-neutral-100 rounded" />
              </div>
              <div className="h-11 w-full bg-neutral-100 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Tab 1: Missions disponibles */}
      {!loading && activeTab === 'disponibles' && (
        <section aria-label="Missions disponibles">
          {visibleOpenTasks.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center">
              <p className="font-display text-lg font-bold text-neutral-900 mb-1.5">
                Aucune mission disponible pour le moment
              </p>
              <p className="text-sm text-neutral-600 max-w-md mx-auto">
                {hiddenOpenCount > 0
                  ? 'Vous avez masqué les missions disponibles. Cliquez sur « Réafficher » pour les consulter.'
                  : 'Dès qu’une nouvelle mission est publiée, elle apparaît ici prête à être acceptée.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleOpenTasks.map((task) => {
                const isBusy = busyTaskId === task.id;

                return (
                  <article
                    key={task.id}
                    className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between gap-5 hover:border-orange-300 transition-colors"
                  >
                    <div className="space-y-3">
                      {(task.Visibilite === 'Selection' || unreadTaskIds.has(task.id)) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-[#9A3412]">
                          {unreadTaskIds.has(task.id) && <span>Nouvelle alerte</span>}
                          {unreadTaskIds.has(task.id) && task.Visibilite === 'Selection' && (
                            <span aria-hidden="true">·</span>
                          )}
                          {task.Visibilite === 'Selection' && (
                            <span>Mission dédiée · Sélection directe</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-mono tabular-nums text-2xl font-bold text-[#05944F] whitespace-nowrap">
                          {formatDZD(task.Prix_DZD)}
                        </span>
                        <span className="font-mono text-xs font-semibold text-neutral-500">
                          {task.ID_Tache}
                        </span>
                      </div>

                      <h2 className="font-display text-lg font-bold text-neutral-900 leading-snug">
                        {task.Titre_Projet}
                      </h2>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
                        <span className="font-medium text-neutral-800">{task.Style_Montage}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{task.Duree_Video}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Échéance {formatDateFR(task.Deadline)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-neutral-100 flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleClaim(task)}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBusy ? 'Attribution...' : 'Accepter la mission'}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleHide(task.id)}
                        title="Ignorer et masquer cette mission"
                        aria-label="Ignorer et masquer cette mission"
                        className="inline-flex items-center justify-center p-3 rounded-lg bg-[#F6F6F6] border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <EyeOff className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Mes missions (Read-only status progression + "Commencer le montage" button) */}
      {!loading && activeTab === 'attribuees' && (
        <section aria-label="Mes missions">
          {sortedAssignedMissions.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center">
              <p className="font-display text-lg font-bold text-neutral-900 mb-1.5">
                Aucune mission attribuée
              </p>
              <p className="text-sm text-neutral-600 max-w-md mx-auto mb-5">
                Acceptez une mission disponible pour obtenir immédiatement les rushs Google Drive
                et commencer le montage.
              </p>
              <button
                type="button"
                onClick={() => onTabChange('disponibles')}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors cursor-pointer"
              >
                Voir les missions disponibles
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedAssignedMissions.map((mission) => {
                const status = normalizeAssignedStatus(mission.Statut);
                const statusIndex = WORKFLOW_STATUSES.indexOf(status);
                const safeDriveUrl = sanitizeExternalUrl(mission.Lien_Fichiers);
                const deadlineMs = mission.Claim_Deadline_Ms ?? 0;
                const whatsappSent = mission.WhatsApp_Contacte === true;
                const chefConfirmed = mission.Chef_Monteur_Confirme === true;
                const canStartEditing = status === 'Assigned' && whatsappSent && chefConfirmed;
                const needsWhatsApp = status === 'Assigned' && !whatsappSent;
                const awaitingChefConfirm = status === 'Assigned' && whatsappSent && !chefConfirmed;
                const hasActiveCountdown = needsWhatsApp && deadlineMs > 0;
                const remainingMs = Math.max(0, deadlineMs - nowMs);
                const isUrgent = remainingMs <= 60000;
                const isStarting = busyTaskId === mission.taskId;
                const waUrl = buildChefMonteurWhatsAppUrl({
                  idTache: mission.ID_Tache,
                  titreProjet: mission.Titre_Projet,
                  prixDZD: mission.Prix_DZD,
                  monteurNom: session.nom,
                  monteurPhone: session.phone,
                });

                return (
                  <article
                    key={mission.id}
                    className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between gap-5"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <MissionStatusBadge status={status} />
                        <span className="font-mono tabular-nums text-lg font-bold text-[#05944F] whitespace-nowrap">
                          {formatDZD(mission.Prix_DZD)}
                        </span>
                      </div>

                      <h2 className="font-display text-lg font-bold text-neutral-900 leading-snug">
                        {mission.Titre_Projet}
                      </h2>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
                        <span className="font-mono font-semibold text-neutral-800">
                          {mission.ID_Tache}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{mission.Style_Montage}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{mission.Duree_Video}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDateFR(mission.Deadline)}
                        </span>
                      </div>

                      {/* Read-Only Workflow Progression Strip */}
                      <div className="pt-2 border-t border-neutral-100">
                        <p className="text-[11px] font-medium text-neutral-500 mb-1">
                          Suivi de production (lecture seule)
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
                          {WORKFLOW_STATUSES.map((step, idx) => {
                            const isCurrent = idx === statusIndex;
                            const isCompleted = idx < statusIndex;
                            return (
                              <span key={step} className="inline-flex items-center gap-1.5">
                                {idx > 0 && (
                                  <span aria-hidden="true" className="text-neutral-300">
                                    ·
                                  </span>
                                )}
                                <span
                                  className={
                                    isCurrent
                                      ? status === 'Done'
                                        ? 'font-bold text-[#05944F]'
                                        : 'font-bold text-[#9A3412]'
                                      : isCompleted
                                      ? 'font-medium text-neutral-700'
                                      : 'text-neutral-400'
                                  }
                                >
                                  {step}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {needsWhatsApp && (
                        <div className="rounded-lg bg-[#F6F6F6] border border-neutral-200 p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-900">
                              <Clock
                                className={`w-3.5 h-3.5 ${
                                  hasActiveCountdown && isUrgent ? 'text-red-600' : 'text-[#9A3412]'
                                }`}
                              />
                              {hasActiveCountdown
                                ? 'Délai de contact WhatsApp'
                                : 'Contact WhatsApp requis'}
                            </span>
                            {hasActiveCountdown && (
                              <span
                                data-testid={`countdown-${mission.ID_Tache}`}
                                className={`font-mono tabular-nums text-base font-bold ${
                                  isUrgent ? 'text-red-600' : 'text-neutral-900'
                                }`}
                              >
                                {formatCountdownMMSS(remainingMs)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-700 leading-relaxed">
                            {hasActiveCountdown ? (
                              <>
                                Vous avez <strong className="text-neutral-900">5 minutes</strong> pour
                                contacter le chef monteur sur WhatsApp ({ADMIN_WHATSAPP_DISPLAY}) afin de
                                discuter de la mission. Sans message envoyé dans ce délai, la mission
                                sera automatiquement réouverte aux autres monteurs.
                              </>
                            ) : (
                              <>
                                Envoyez d’abord un message WhatsApp au chef monteur (
                                {ADMIN_WHATSAPP_DISPLAY}) pour discuter de la mission et débloquer
                                le bouton « Commencer le montage ».
                              </>
                            )}
                          </p>
                        </div>
                      )}

                      {awaitingChefConfirm && (
                        <div className="rounded-lg bg-[#F6F6F6] border border-orange-200 p-3.5 space-y-1.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A3412]">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            WhatsApp envoyé · En attente de confirmation
                          </span>
                          <p className="text-xs text-neutral-700 leading-relaxed">
                            Le chef monteur doit confirmer votre mission sur son Dashboard avant que
                            vous puissiez cliquer sur « Commencer le montage ».
                          </p>
                        </div>
                      )}

                      {canStartEditing && (
                        <p className="text-xs font-medium text-[#05944F]">
                          Confirmée par le chef monteur · Vous pouvez commencer le montage
                        </p>
                      )}
                    </div>

                    <div className="pt-4 border-t border-neutral-100 space-y-2.5">
                      {needsWhatsApp && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void onConfirmWhatsAppContact(mission)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#05944F] text-white text-sm font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-4 h-4 shrink-0" />
                          <span>Contacter WhatsApp ({ADMIN_WHATSAPP_DISPLAY})</span>
                        </a>
                      )}

                      {status === 'Assigned' && (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            disabled={!canStartEditing || isStarting}
                            aria-disabled={!canStartEditing || isStarting}
                            onClick={() => void handleStart(mission)}
                            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                              !canStartEditing
                                ? 'bg-neutral-200/70 border border-neutral-300 text-neutral-600 cursor-not-allowed'
                                : 'bg-[#9A3412] text-white hover:bg-[#7C2D12] cursor-pointer disabled:opacity-50'
                            }`}
                          >
                            {!canStartEditing ? (
                              <Lock className="w-4 h-4 shrink-0" />
                            ) : (
                              <Play className="w-4 h-4 shrink-0" />
                            )}
                            <span>
                              {isStarting ? 'Mise à jour...' : 'Commencer le montage'}
                            </span>
                          </button>
                          {!canStartEditing && (
                            <p className="text-[11px] text-neutral-500 text-center">
                              {needsWhatsApp
                                ? 'Envoyez d’abord le message WhatsApp, puis attendez la confirmation du chef monteur.'
                                : 'Bouton verrouillé jusqu’à la confirmation du chef monteur sur le Dashboard.'}
                            </p>
                          )}
                        </div>
                      )}

                      {safeDriveUrl ? (
                        <a
                          href={safeDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                            status === 'Assigned'
                              ? 'bg-[#F6F6F6] border border-neutral-200 text-neutral-800 hover:bg-neutral-200/70'
                              : 'bg-[#276EF1] text-white hover:bg-blue-700 py-3'
                          }`}
                        >
                          <span>Ouvrir les rushs (Google Drive)</span>
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-500">
                          Lien Google Drive non valide.
                        </span>
                      )}

                      {status !== 'Done' && (mission.WhatsApp_Contacte === true || status !== 'Assigned') && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-[#05944F]" />
                          <span>Discuter sur WhatsApp ({ADMIN_WHATSAPP_DISPLAY})</span>
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Historique des paiements (Missions au statut Done + date de finalisation + total cumulé) */}
      {!loading && activeTab === 'paiements' && (
        <section aria-label="Historique des paiements" className="space-y-5">
          {/* Summary Strip */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-medium text-neutral-500">Montant total cumulé</p>
              <p
                data-testid="payments-cumulative-total"
                className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-[#05944F] mt-1"
              >
                {formatDZD(totalEarningsDZD)}
              </p>
            </div>
            <div className="sm:border-l sm:border-neutral-200 sm:pl-6">
              <p className="text-xs font-medium text-neutral-500">Missions finalisées (Done)</p>
              <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">
                {paymentHistoryRows.length}
              </p>
            </div>
            <div className="sm:border-l sm:border-neutral-200 sm:pl-6">
              <p className="text-xs font-medium text-neutral-500">Dernière validation</p>
              <p className="font-mono tabular-nums text-sm sm:text-base font-semibold text-neutral-900 mt-2">
                {paymentHistoryRows.length > 0
                  ? formatTimestampFR(
                      paymentHistoryRows[0].mission.updatedAt,
                      paymentHistoryRows[0].mission.Deadline
                    )
                  : 'Aucune pour le moment'}
              </p>
            </div>
          </div>

          {paymentHistoryRows.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center space-y-3">
              <p className="font-display text-lg font-bold text-neutral-900">
                Aucun paiement enregistré pour le moment
              </p>
              <p className="text-sm text-neutral-600 max-w-md mx-auto">
                Dès qu&apos;une de vos missions passe au statut « Done », elle apparaît ici avec sa
                date de finalisation et vient créditer votre montant total cumulé.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    onTabChange(sortedAssignedMissions.length > 0 ? 'attribuees' : 'disponibles')
                  }
                  className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors cursor-pointer"
                >
                  {sortedAssignedMissions.length > 0
                    ? 'Voir mes missions en cours'
                    : 'Voir les missions disponibles'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-neutral-900">
                  Détail des missions créditées
                </h2>
                <span className="text-xs font-medium text-neutral-500 tabular-nums">
                  {paymentHistoryRows.length}{' '}
                  {paymentHistoryRows.length > 1 ? 'opérations' : 'opération'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                      <th className="py-3.5 px-5 whitespace-nowrap">ID</th>
                      <th className="py-3.5 px-5">Mission</th>
                      <th className="py-3.5 px-5 whitespace-nowrap">Date de finalisation</th>
                      <th className="py-3.5 px-5 text-right whitespace-nowrap">Montant</th>
                      <th className="py-3.5 px-5 text-right whitespace-nowrap">Cumul</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 text-sm">
                    {paymentHistoryRows.map(({ mission, cumulativeDZD }) => (
                      <tr key={mission.id} className="hover:bg-neutral-50/70 transition-colors">
                        <td className="py-4 px-5 font-mono text-xs font-semibold text-neutral-700 whitespace-nowrap">
                          {mission.ID_Tache}
                        </td>
                        <td className="py-4 px-5">
                          <p className="font-display font-semibold text-neutral-900 leading-snug">
                            {mission.Titre_Projet}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {mission.Style_Montage}
                            <span aria-hidden="true" className="mx-1.5">
                              ·
                            </span>
                            <span className="font-mono tabular-nums">{mission.Duree_Video}</span>
                          </p>
                        </td>
                        <td className="py-4 px-5 font-mono tabular-nums text-xs text-neutral-700 whitespace-nowrap">
                          {formatTimestampFR(mission.updatedAt, mission.Deadline)}
                        </td>
                        <td className="py-4 px-5 text-right font-mono tabular-nums font-bold text-[#05944F] whitespace-nowrap">
                          +{formatDZD(mission.Prix_DZD)}
                        </td>
                        <td className="py-4 px-5 text-right font-mono tabular-nums font-semibold text-neutral-800 whitespace-nowrap">
                          {formatDZD(cumulativeDZD)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-neutral-200 bg-neutral-50/80 text-sm">
                      <td colSpan={3} className="py-4 px-5 font-display font-bold text-neutral-900">
                        Total cumulé ({paymentHistoryRows.length}{' '}
                        {paymentHistoryRows.length > 1 ? 'missions Done' : 'mission Done'})
                      </td>
                      <td className="py-4 px-5 text-right font-mono tabular-nums font-bold text-[#05944F] whitespace-nowrap">
                        {formatDZD(totalEarningsDZD)}
                      </td>
                      <td className="py-4 px-5 text-right font-mono tabular-nums font-bold text-neutral-900 whitespace-nowrap">
                        {formatDZD(totalEarningsDZD)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
