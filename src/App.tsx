import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  getCachedGmailAccessToken,
  googleProvider,
  handleFirestoreError,
  OperationType,
  setCachedGmailAccessToken,
} from './firebase';
import {
  AssignedMissionRecord,
  AssignedWorkflowStatus,
  CLAIM_WINDOW_MS,
  isAdminEmail,
  MonteurAccountRecord,
  MonteurNotificationItem,
  MonteurSession,
  normalizeAssignedStatus,
  normalizeTaskStatus,
  TaskInviteRecord,
  TaskRecord,
  TASK_CONSTRAINTS,
  TaskVisibility,
  ToastItem,
} from './types';
import {
  DEMO_SEED_TASKS,
  deriveCredentialId,
  formatDZD,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  ParsedCsvTask,
} from './utils/formatters';
import { playNotificationChime } from './utils/sound';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { TopBar } from './components/TopBar';
import { ToastContainer } from './components/ToastContainer';
import { MonteurDashboard, MonteurTab } from './components/MonteurDashboard';
import {
  AdminDashboard,
  AdminSection,
  MonteurAccountFormPayload,
  PendingEmailDispatch,
  TaskFormPayload,
} from './components/AdminDashboard';

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '-');
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('permission-denied') ||
    msg.includes('Missing or insufficient permissions')
  );
}

export default function App() {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [monteurSession, setMonteurSession] = useState<MonteurSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isMonteurPortalUrl] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('espace') === 'monteur';
  });
  const [adminEnteredMonteurSpace, setAdminEnteredMonteurSpace] = useState<boolean>(false);

  // Navigation State
  const [monteurTab, setMonteurTab] = useState<MonteurTab>('disponibles');
  const [adminSection, setAdminSection] = useState<AdminSection>('tableau');

  // Firestore State
  const [adminTasks, setAdminTasks] = useState<TaskRecord[]>([]);
  const [adminMonteurs, setAdminMonteurs] = useState<MonteurAccountRecord[]>([]);
  const [credAvailability, setCredAvailability] = useState<Record<string, boolean>>({});
  const [monteurDisponible, setMonteurDisponible] = useState<boolean>(true);
  const [publicOpenTasks, setPublicOpenTasks] = useState<TaskRecord[]>([]);
  const [invitedTasks, setInvitedTasks] = useState<TaskRecord[]>([]);
  const [assignedMissions, setAssignedMissions] = useState<AssignedMissionRecord[]>([]);
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set());
  const [dataLoading, setDataLoading] = useState(false);
  const [emailProviderConfigured, setEmailProviderConfigured] = useState<boolean | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean>(() =>
    Boolean(getCachedGmailAccessToken())
  );
  const [pendingEmailConfirm, setPendingEmailConfirm] = useState<PendingEmailDispatch | null>(null);

  // Monteur Notification State
  const [monteurNotifications, setMonteurNotifications] = useState<MonteurNotificationItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [browserNotifEnabled, setBrowserNotifEnabled] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission === 'granted'
      : false
  );
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const publicTasksLoadedRef = useRef(false);
  const invitesLoadedRef = useRef(false);
  const initialNotifHydratedRef = useRef(false);
  const seenVersionsRef = useRef<Map<string, number>>(new Map());

  const adminMonteursWithAvailability = useMemo(
    () =>
      adminMonteurs.map((m) => ({
        ...m,
        disponible: credAvailability[m.credId] ?? true,
      })),
    [adminMonteurs, credAvailability]
  );

  const openTasks = useMemo(() => {
    const byId = new Map<string, TaskRecord>();
    for (const t of publicOpenTasks) {
      byId.set(t.id, { ...t, Visibilite: t.Visibilite ?? 'Tous' });
    }
    for (const t of invitedTasks) {
      byId.set(t.id, t);
    }
    return Array.from(byId.values()).sort((a, b) => a.Deadline.localeCompare(b.Deadline));
  }, [publicOpenTasks, invitedTasks]);

  const unreadNotificationsCount = useMemo(
    () => monteurNotifications.filter((n) => !n.read).length,
    [monteurNotifications]
  );

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Firebase Google Auth listener (Admin authentication)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && isAdminEmail(currentUser.email)) {
        setAdminUser(currentUser);
      } else {
        setAdminUser(null);
        setCachedGmailAccessToken(null);
        setGmailConnected(false);
        setPendingEmailConfirm(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const adminEmail = (adminUser?.email ?? '').trim().toLowerCase();
  const isAdmin = Boolean(adminUser && isAdminEmail(adminEmail));
  const inMonteurPortalMode = isMonteurPortalUrl || adminEnteredMonteurSpace;

  // Check server-side email provider availability when Admin is signed in
  useEffect(() => {
    if (!authReady || !isAdmin || !adminUser) {
      setEmailProviderConfigured(null);
      return;
    }
    let cancelled = false;
    void adminUser
      .getIdToken()
      .then((token) =>
        fetch('/api/email-status', {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: { configured?: boolean } | null) => {
        if (!cancelled && data && typeof data.configured === 'boolean') {
          setEmailProviderConfigured(data.configured);
        }
      })
      .catch(() => {
        // Non-blocking status check
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, isAdmin, adminUser]);

  // Admin Real-Time Listeners
  useEffect(() => {
    if (!authReady || !isAdmin) return;

    setDataLoading(true);
    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        const list: TaskRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TaskRecord, 'id'>),
        }));
        list.sort((a, b) => a.ID_Tache.localeCompare(b.ID_Tache));
        setAdminTasks(list);
        setDataLoading(false);

        // Backfill legacy tasks per document so one invalid doc never aborts the entire sync
        const legacyTasks = list.filter(
          (t) =>
            (t.Statut as string) === 'En cours' ||
            t.Visibilite === undefined ||
            t.Monteurs_Autorises === undefined ||
            t.Ouverte_Pour_Tous === undefined ||
            t.Claim_Deadline_Ms === undefined ||
            t.WhatsApp_Contacte === undefined ||
            t.Chef_Monteur_Confirme === undefined
        );
        if (legacyTasks.length > 0) {
          for (const t of legacyTasks) {
            const rawAllowed = Array.isArray(t.Monteurs_Autorises) ? t.Monteurs_Autorises : [];
            const vis: TaskVisibility =
              t.Visibilite === 'Selection' && rawAllowed.length > 0 ? 'Selection' : 'Tous';
            const allowed = vis === 'Selection' ? rawAllowed : [];
            const nextStatus = normalizeTaskStatus(t.Statut);
            const isOpen = nextStatus === 'Ouverte';
            const chefConfirmed = isOpen
              ? false
              : (t.Chef_Monteur_Confirme ?? (nextStatus !== 'Assigned'));
            const whatsappContacted = isOpen ? false : (t.WhatsApp_Contacte ?? true);
            const claimDeadlineMs = isOpen ? 0 : (t.Claim_Deadline_Ms ?? 0);

            void updateDoc(doc(db, 'tasks', t.id), {
              Statut: nextStatus,
              Visibilite: vis,
              Monteurs_Autorises: allowed,
              Ouverte_Pour_Tous: isOpen && vis === 'Tous',
              Monteur_Valide_Email: isOpen ? '' : t.Monteur_Valide_Email,
              Monteur_Valide_Nom: isOpen ? '' : t.Monteur_Valide_Nom,
              Monteur_Cred_Id: isOpen ? '' : t.Monteur_Cred_Id,
              Claim_Deadline_Ms: claimDeadlineMs,
              WhatsApp_Contacte: whatsappContacted,
              Chef_Monteur_Confirme: chefConfirmed,
              updatedAt: serverTimestamp(),
            }).catch(() => {
              // Non-blocking background schema sync
            });

            if (t.Monteur_Cred_Id && !isOpen) {
              void updateDoc(
                doc(db, 'monteur_credentials', t.Monteur_Cred_Id, 'missions', t.id),
                {
                  Statut: normalizeAssignedStatus(nextStatus),
                  Visibilite: vis,
                  Claim_Deadline_Ms: claimDeadlineMs,
                  WhatsApp_Contacte: whatsappContacted,
                  Chef_Monteur_Confirme: chefConfirmed,
                  updatedAt: serverTimestamp(),
                }
              ).catch(() => {
                // Ignore if subcollection document was not yet created
              });
            }
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubMonteurs = onSnapshot(
      collection(db, 'monteur_accounts'),
      (snap) => {
        const list: MonteurAccountRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MonteurAccountRecord, 'id'>),
        }));
        list.sort((a, b) => a.nom.localeCompare(b.nom));
        setAdminMonteurs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'monteur_accounts')
    );

    const unsubCreds = onSnapshot(
      collection(db, 'monteur_credentials'),
      (snap) => {
        const availMap: Record<string, boolean> = {};
        const legacyCredIds: string[] = [];
        for (const d of snap.docs) {
          const data = d.data() as { disponible?: boolean };
          if (data.disponible === undefined) {
            legacyCredIds.push(d.id);
            availMap[d.id] = true;
          } else {
            availMap[d.id] = data.disponible;
          }
        }
        setCredAvailability(availMap);

        if (legacyCredIds.length > 0) {
          for (const id of legacyCredIds) {
            void updateDoc(doc(db, 'monteur_credentials', id), {
              disponible: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {
              // Non-blocking background schema sync
            });
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'monteur_credentials')
    );

    return () => {
      unsubTasks();
      unsubMonteurs();
      unsubCreds();
    };
  }, [authReady, isAdmin]);

  // Hydrate Monteur Notification Preferences & History per Credential Session
  useEffect(() => {
    publicTasksLoadedRef.current = false;
    invitesLoadedRef.current = false;
    initialNotifHydratedRef.current = false;

    if (!monteurSession) {
      seenVersionsRef.current = new Map();
      setMonteurNotifications([]);
      document.title = 'Portail Monteurs Vidéo';
      return;
    }

    const credId = monteurSession.credId;
    try {
      const rawSound = window.localStorage.getItem(`pmv_sound_${credId}`);
      setSoundEnabled(rawSound === null ? true : rawSound === 'true');

      const rawBrowser = window.localStorage.getItem(`pmv_browser_notif_${credId}`);
      const perm =
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'unsupported';
      setBrowserPermission(perm);
      setBrowserNotifEnabled(
        perm === 'granted' && (rawBrowser === null ? true : rawBrowser === 'true')
      );

      const rawVersions = window.localStorage.getItem(`pmv_notif_versions_${credId}`);
      const parsedVersions = rawVersions
        ? (JSON.parse(rawVersions) as Record<string, number>)
        : {};
      seenVersionsRef.current = new Map(
        Object.entries(parsedVersions).filter(([, v]) => typeof v === 'number')
      );

      const rawItems = window.localStorage.getItem(`pmv_notif_items_${credId}`);
      const parsedItems = rawItems ? (JSON.parse(rawItems) as MonteurNotificationItem[]) : [];
      setMonteurNotifications(Array.isArray(parsedItems) ? parsedItems.slice(0, 30) : []);
    } catch {
      seenVersionsRef.current = new Map();
      setMonteurNotifications([]);
    }
  }, [monteurSession]);

  // Keep document title updated with unread notification count for active monteur
  useEffect(() => {
    if (monteurSession && unreadNotificationsCount > 0) {
      document.title = `(${unreadNotificationsCount}) Portail Monteurs Vidéo`;
    } else {
      document.title = 'Portail Monteurs Vidéo';
    }
  }, [monteurSession, unreadNotificationsCount]);

  // Monteur Real-Time Listeners (strictly scoped to active MonteurSession)
  useEffect(() => {
    if (!authReady || !monteurSession) return;

    setDataLoading(true);
    const credId = monteurSession.credId;

    const unsubCred = onSnapshot(
      doc(db, 'monteur_credentials', credId),
      (snap) => {
        if (!snap.exists() || snap.data()?.active !== true) {
          setMonteurSession(null);
          setMonteurDisponible(true);
          notify('error', 'Votre accès monteur a été désactivé ou modifié.');
        } else {
          setMonteurDisponible(snap.data()?.disponible !== false);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `monteur_credentials/${credId}`)
    );

    const openQuery = query(collection(db, 'tasks'), where('Ouverte_Pour_Tous', '==', true));
    const unsubOpen = onSnapshot(
      openQuery,
      (snap) => {
        const list: TaskRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TaskRecord, 'id'>),
        }));
        publicTasksLoadedRef.current = true;
        setPublicOpenTasks(list);
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks?Ouverte_Pour_Tous=true')
    );

    const unsubInvites = onSnapshot(
      collection(db, 'monteur_credentials', credId, 'invites'),
      (snap) => {
        const list: TaskRecord[] = snap.docs.map((d) => {
          const inv = d.data() as Omit<TaskInviteRecord, 'id'>;
          return {
            id: inv.taskId || d.id,
            ID_Tache: inv.ID_Tache,
            Titre_Projet: inv.Titre_Projet,
            Style_Montage: inv.Style_Montage,
            Duree_Video: inv.Duree_Video,
            Deadline: inv.Deadline,
            Prix_DZD: inv.Prix_DZD,
            Statut: 'Ouverte',
            Monteur_Valide_Email: '',
            Monteur_Valide_Nom: '',
            Monteur_Cred_Id: '',
            Lien_Fichiers: inv.Lien_Fichiers,
            Visibilite: 'Selection',
            Monteurs_Autorises: [monteurSession.phone],
            Ouverte_Pour_Tous: false,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
          };
        });
        invitesLoadedRef.current = true;
        setInvitedTasks(list);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `monteur_credentials/${credId}/invites`)
    );

    const unsubMissions = onSnapshot(
      collection(db, 'monteur_credentials', credId, 'missions'),
      (snap) => {
        const list: AssignedMissionRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AssignedMissionRecord, 'id'>),
        }));
        setAssignedMissions(list);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `monteur_credentials/${credId}/missions`)
    );

    const unsubPrefs = onSnapshot(
      doc(db, 'monteur_credentials', credId, 'prefs', 'hidden'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { hiddenTaskIds?: string[] };
          setHiddenTaskIds(new Set(Array.isArray(data.hiddenTaskIds) ? data.hiddenTaskIds : []));
        } else {
          setHiddenTaskIds(new Set());
        }
      },
      (err) =>
        handleFirestoreError(err, OperationType.GET, `monteur_credentials/${credId}/prefs/hidden`)
    );

    return () => {
      unsubCred();
      unsubOpen();
      unsubInvites();
      unsubMissions();
      unsubPrefs();
    };
  }, [authReady, monteurSession, notify]);

  // Real-time mission availability notification trigger
  useEffect(() => {
    if (!monteurSession) return;
    if (!publicTasksLoadedRef.current || !invitesLoadedRef.current) return;

    const credId = monteurSession.credId;
    const isInitialLoad = !initialNotifHydratedRef.current;
    initialNotifHydratedRef.current = true;

    const newlyTriggered: { task: TaskRecord; versionMs: number }[] = [];

    for (const task of openTasks) {
      if (task.Statut !== 'Ouverte') continue;
      if (hiddenTaskIds.has(task.id)) continue;

      const rawTs = task.updatedAt?.toMillis?.() ?? task.createdAt?.toMillis?.() ?? 0;
      const prevVersion = seenVersionsRef.current.get(task.id);

      if (prevVersion === undefined || (rawTs > 0 && rawTs > prevVersion)) {
        const recordedVersion = rawTs > 0 ? rawTs : Date.now();
        seenVersionsRef.current.set(task.id, recordedVersion);
        newlyTriggered.push({ task, versionMs: recordedVersion });
      }
    }

    if (newlyTriggered.length === 0) return;

    try {
      window.localStorage.setItem(
        `pmv_notif_versions_${credId}`,
        JSON.stringify(Object.fromEntries(seenVersionsRef.current.entries()))
      );
    } catch {
      // Ignore storage quota errors
    }

    const nowMs = Date.now();
    const newItems: MonteurNotificationItem[] = newlyTriggered.map(({ task, versionMs }, idx) => ({
      id: `${task.id}_${versionMs}`,
      taskId: task.id,
      ID_Tache: task.ID_Tache,
      Titre_Projet: task.Titre_Projet,
      Style_Montage: task.Style_Montage,
      Prix_DZD: task.Prix_DZD,
      Deadline: task.Deadline,
      Visibilite: task.Visibilite ?? 'Tous',
      receivedAtMs: nowMs + idx,
      read: false,
    }));

    setMonteurNotifications((prev) => {
      const existingIds = new Set(newItems.map((i) => i.id));
      const merged = [...newItems, ...prev.filter((i) => !existingIds.has(i.id))].slice(0, 30);
      try {
        window.localStorage.setItem(`pmv_notif_items_${credId}`, JSON.stringify(merged));
      } catch {
        // Ignore storage quota errors
      }
      return merged;
    });

    if (isInitialLoad) {
      if (newlyTriggered.length === 1) {
        const t = newlyTriggered[0].task;
        notify(
          'info',
          `Nouvelle mission disponible : ${t.ID_Tache} · ${t.Titre_Projet} (${formatDZD(t.Prix_DZD)})`
        );
      } else {
        notify(
          'info',
          `${newlyTriggered.length} nouvelles missions disponibles dans votre espace.`
        );
      }
      return;
    }

    // Live arrival while Monteur is connected
    if (soundEnabled) {
      playNotificationChime();
    }

    for (const { task } of newlyTriggered) {
      const label =
        task.Visibilite === 'Selection'
          ? `Mission dédiée disponible : ${task.ID_Tache} · ${task.Titre_Projet} (${formatDZD(task.Prix_DZD)})`
          : `Nouvelle mission disponible : ${task.ID_Tache} · ${task.Titre_Projet} (${formatDZD(task.Prix_DZD)})`;
      notify('info', label);

      if (
        browserNotifEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const browserNotif = new Notification(
            `${task.Visibilite === 'Selection' ? 'Mission dédiée' : 'Nouvelle mission'} · ${task.ID_Tache}`,
            {
              body: `${task.Titre_Projet} — ${formatDZD(task.Prix_DZD)}`,
              tag: `mission-${task.id}`,
            }
          );
          browserNotif.onclick = () => {
            window.focus();
            setMonteurTab('disponibles');
            browserNotif.close();
          };
        } catch {
          // Ignore browser Notification constructor restrictions on mobile webviews
        }
      }
    }
  }, [
    monteurSession,
    openTasks,
    hiddenTaskIds,
    soundEnabled,
    browserNotifEnabled,
    notify,
  ]);

  const handleToggleSound = useCallback(
    (next: boolean) => {
      setSoundEnabled(next);
      if (monteurSession) {
        try {
          window.localStorage.setItem(`pmv_sound_${monteurSession.credId}`, String(next));
        } catch {
          // Ignore storage quota errors
        }
      }
      if (next) {
        playNotificationChime();
        notify('success', 'Alertes sonores activées.');
      } else {
        notify('info', 'Alertes sonores coupées.');
      }
    },
    [monteurSession, notify]
  );

  const handleEnableBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify('info', 'Ce navigateur ne prend pas en charge les notifications système.');
      return;
    }
    if (Notification.permission === 'denied') {
      setBrowserPermission('denied');
      setBrowserNotifEnabled(false);
      notify(
        'error',
        'Les notifications sont bloquées par votre navigateur. Autorisez-les dans les paramètres du site.'
      );
      return;
    }
    if (Notification.permission === 'granted') {
      const next = !browserNotifEnabled;
      setBrowserPermission('granted');
      setBrowserNotifEnabled(next);
      if (monteurSession) {
        try {
          window.localStorage.setItem(`pmv_browser_notif_${monteurSession.credId}`, String(next));
        } catch {
          // Ignore
        }
      }
      notify(
        next ? 'success' : 'info',
        next ? 'Notifications navigateur activées.' : 'Notifications navigateur mises en pause.'
      );
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setBrowserPermission(result);
      const granted = result === 'granted';
      setBrowserNotifEnabled(granted);
      if (monteurSession) {
        try {
          window.localStorage.setItem(
            `pmv_browser_notif_${monteurSession.credId}`,
            String(granted)
          );
        } catch {
          // Ignore
        }
      }
      if (granted) {
        if (soundEnabled) playNotificationChime();
        notify('success', 'Notifications navigateur activées pour les nouvelles missions.');
        try {
          new Notification('Portail Monteurs Vidéo', {
            body: 'Vous serez averti dès qu’une nouvelle mission est disponible.',
          });
        } catch {
          // Ignore
        }
      } else {
        notify('info', 'Autorisation de notification non accordée.');
      }
    } catch {
      notify('error', 'Impossible d’activer les notifications navigateur.');
    }
  }, [browserNotifEnabled, monteurSession, notify, soundEnabled]);

  const handleMarkNotificationRead = useCallback(
    (notifId: string) => {
      setMonteurNotifications((prev) => {
        const next = prev.map((n) => (n.id === notifId ? { ...n, read: true } : n));
        if (monteurSession) {
          try {
            window.localStorage.setItem(
              `pmv_notif_items_${monteurSession.credId}`,
              JSON.stringify(next)
            );
          } catch {
            // Ignore
          }
        }
        return next;
      });
    },
    [monteurSession]
  );

  const handleMarkAllNotificationsRead = useCallback(() => {
    setMonteurNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      if (monteurSession) {
        try {
          window.localStorage.setItem(
            `pmv_notif_items_${monteurSession.credId}`,
            JSON.stringify(next)
          );
        } catch {
          // Ignore
        }
      }
      return next;
    });
  }, [monteurSession]);

  const handleClearNotifications = useCallback(() => {
    setMonteurNotifications([]);
    if (monteurSession) {
      try {
        window.localStorage.setItem(`pmv_notif_items_${monteurSession.credId}`, '[]');
      } catch {
        // Ignore
      }
    }
  }, [monteurSession]);

  // Auth Actions
  const handleMonteurSignIn = async (rawPhone: string, rawCode: string) => {
    setAuthError(null);
    const normPhone = normalizePhone(rawPhone);
    const cleanCode = rawCode.trim();

    if (normPhone.length < TASK_CONSTRAINTS.PHONE_MIN || cleanCode.length < TASK_CONSTRAINTS.CODE_MIN) {
      const msg = 'Numéro de téléphone ou code d’accès invalide.';
      setAuthError(msg);
      return;
    }

    try {
      const credId = await deriveCredentialId(normPhone, cleanCode);
      const snap = await getDoc(doc(db, 'monteur_credentials', credId));

      if (!snap.exists()) {
        const msg = 'Numéro de téléphone ou code d’accès incorrect.';
        setAuthError(msg);
        notify('error', msg);
        return;
      }

      const data = snap.data() as {
        phone: string;
        nom: string;
        active: boolean;
        disponible?: boolean;
      };
      if (!data.active) {
        const msg = 'Ce compte monteur est actuellement désactivé. Contactez l’administrateur.';
        setAuthError(msg);
        notify('error', msg);
        return;
      }

      setMonteurSession({
        credId,
        phone: data.phone,
        nom: data.nom,
      });
      setMonteurDisponible(data.disponible !== false);
      setMonteurTab('disponibles');
      notify('success', `Bienvenue ${data.nom}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'monteur_credentials');
    }
  };

  const handleToggleMonteurDisponible = useCallback(
    async (nextDisponible: boolean) => {
      if (!monteurSession) return;
      const path = `monteur_credentials/${monteurSession.credId}`;
      try {
        await updateDoc(doc(db, 'monteur_credentials', monteurSession.credId), {
          disponible: nextDisponible,
          updatedAt: serverTimestamp(),
        });
        setMonteurDisponible(nextDisponible);
        notify(
          'success',
          nextDisponible
            ? 'Statut mis à jour : vous êtes maintenant Disponible.'
            : 'Statut mis à jour : vous êtes maintenant Non disponible.'
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [monteurSession, notify]
  );

  const handleAdminGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (!isAdminEmail(res.user.email)) {
        await signOut(auth);
        setCachedGmailAccessToken(null);
        setGmailConnected(false);
        const msg =
          'Seul le compte administrateur autorisé peut accéder à la console admin. Les monteurs doivent utiliser leur numéro de téléphone et code d’accès.';
        setAuthError(msg);
        notify('error', msg);
        return;
      }
      const cred = GoogleAuthProvider.credentialFromResult(res);
      const accessToken = cred?.accessToken ?? null;
      setCachedGmailAccessToken(accessToken);
      setGmailConnected(Boolean(accessToken));
      setMonteurSession(null);
      setMonteurDisponible(true);
      setAdminEnteredMonteurSpace(false);
      notify('success', 'Connexion administrateur réussie.');
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Connexion annulée.'
          : 'Impossible de finaliser la connexion Google administrateur.';
      setAuthError(msg);
      notify('error', msg);
    }
  };

  const handleConnectGmail = useCallback(async (): Promise<string | null> => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (!isAdminEmail(res.user.email)) {
        await signOut(auth);
        setCachedGmailAccessToken(null);
        setGmailConnected(false);
        notify('error', 'Veuillez autoriser le compte administrateur autorisé.');
        return null;
      }
      const cred = GoogleAuthProvider.credentialFromResult(res);
      const token = cred?.accessToken ?? null;
      setCachedGmailAccessToken(token);
      setGmailConnected(Boolean(token));
      if (token) {
        notify('success', 'Gmail connecté pour l’envoi des notifications par e-mail.');
      } else {
        notify(
          'error',
          'Permission d’envoi Gmail non accordée. Réessayez en cochant la case d’autorisation Gmail.'
        );
      }
      return token;
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Autorisation Gmail annulée.'
          : 'Impossible de connecter Gmail.';
      notify('error', msg);
      return null;
    }
  }, [notify]);

  const handleSignOutMonteur = () => {
    setMonteurSession(null);
    setMonteurDisponible(true);
    setPublicOpenTasks([]);
    setInvitedTasks([]);
    setAssignedMissions([]);
    setHiddenTaskIds(new Set());
    notify('info', 'Session monteur fermée.');
  };

  const handleSignOutAdmin = async () => {
    setMonteurSession(null);
    setMonteurDisponible(true);
    setAdminEnteredMonteurSpace(false);
    setPublicOpenTasks([]);
    setInvitedTasks([]);
    setAssignedMissions([]);
    setHiddenTaskIds(new Set());
    setCachedGmailAccessToken(null);
    setGmailConnected(false);
    setPendingEmailConfirm(null);
    if (adminUser) {
      await signOut(auth);
    }
    notify('info', 'Vous êtes déconnecté.');
  };

  const expiringTaskIdsRef = useRef<Set<string>>(new Set());

  // Monteur Direct Claim with 5-minute WhatsApp contact window
  const handleClaimMission = async (task: TaskRecord) => {
    if (!monteurSession) return;
    const { credId, phone, nom } = monteurSession;
    const claimDeadlineMs = Date.now() + CLAIM_WINDOW_MS;
    const vis: TaskVisibility = task.Visibilite ?? 'Tous';

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'tasks', task.id), {
        Statut: 'Assigned',
        Ouverte_Pour_Tous: false,
        Monteur_Valide_Email: phone,
        Monteur_Valide_Nom: nom,
        Monteur_Cred_Id: credId,
        Claim_Deadline_Ms: claimDeadlineMs,
        WhatsApp_Contacte: false,
        Chef_Monteur_Confirme: false,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'monteur_credentials', credId, 'missions', task.id), {
        taskId: task.id,
        ID_Tache: task.ID_Tache,
        Titre_Projet: task.Titre_Projet,
        Style_Montage: task.Style_Montage,
        Duree_Video: task.Duree_Video,
        Deadline: task.Deadline,
        Prix_DZD: task.Prix_DZD,
        Statut: 'Assigned',
        Lien_Fichiers: task.Lien_Fichiers,
        Visibilite: vis,
        Claim_Deadline_Ms: claimDeadlineMs,
        WhatsApp_Contacte: false,
        Chef_Monteur_Confirme: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (vis === 'Selection') {
        batch.delete(doc(db, 'monteur_credentials', credId, 'invites', task.id));
      }

      await batch.commit();
      setMonteurNotifications((prev) => {
        const next = prev.map((n) => (n.taskId === task.id ? { ...n, read: true } : n));
        try {
          window.localStorage.setItem(`pmv_notif_items_${credId}`, JSON.stringify(next));
        } catch {
          // Ignore
        }
        return next;
      });
      notify(
        'success',
        `Mission ${task.ID_Tache} réservée ! Envoyez un message WhatsApp au chef monteur puis attendez sa confirmation sur le Dashboard.`
      );
      setMonteurTab('attribuees');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
        if (task.Visibilite === 'Selection') {
          try {
            await deleteDoc(doc(db, 'monteur_credentials', credId, 'invites', task.id));
          } catch {
            // Ignore cleanup failure
          }
        }
        notify('error', 'Cette mission vient d’être prise par un autre monteur.');
      } else {
        handleFirestoreError(err, OperationType.WRITE, `tasks/${task.id}`);
      }
    }
  };

  const handleConfirmWhatsAppContact = useCallback(
    async (mission: AssignedMissionRecord) => {
      if (!monteurSession) return;
      if (mission.WhatsApp_Contacte === true) return;
      const { credId } = monteurSession;
      const currentStatus = normalizeAssignedStatus(mission.Statut);
      const nextStatus: AssignedWorkflowStatus =
        currentStatus === 'In progress' ? 'In progress' : 'Assigned';
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'tasks', mission.taskId), {
          Statut: nextStatus,
          WhatsApp_Contacte: true,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'monteur_credentials', credId, 'missions', mission.taskId), {
          Statut: nextStatus,
          WhatsApp_Contacte: true,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        notify(
          'success',
          `Message WhatsApp envoyé pour ${mission.ID_Tache}. En attente de confirmation du chef monteur sur le Dashboard.`
        );
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          notify(
            'info',
            'Cette mission a déjà été confirmée ou réouverte entre-temps.'
          );
        } else {
          handleFirestoreError(err, OperationType.UPDATE, `tasks/${mission.taskId}`);
        }
      }
    },
    [monteurSession, notify]
  );

  const handleStartEditing = useCallback(
    async (mission: AssignedMissionRecord) => {
      if (!monteurSession) return;
      if (normalizeAssignedStatus(mission.Statut) !== 'Assigned') return;
      if (mission.WhatsApp_Contacte !== true) {
        notify(
          'error',
          'Envoyez d’abord un message WhatsApp au chef monteur avant de commencer le montage.'
        );
        return;
      }
      if (mission.Chef_Monteur_Confirme !== true) {
        notify(
          'error',
          'En attente de confirmation du chef monteur sur le Dashboard pour débloquer « Commencer le montage ».'
        );
        return;
      }
      const { credId } = monteurSession;
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'tasks', mission.taskId), {
          Statut: 'In progress',
          Claim_Deadline_Ms: 0,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'monteur_credentials', credId, 'missions', mission.taskId), {
          Statut: 'In progress',
          Claim_Deadline_Ms: 0,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        notify('success', `Montage démarré pour ${mission.ID_Tache} · Statut : In progress.`);
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          notify(
            'error',
            'Impossible de démarrer : vérifiez que le chef monteur a bien confirmé la mission sur le Dashboard.'
          );
        } else {
          handleFirestoreError(err, OperationType.UPDATE, `tasks/${mission.taskId}`);
        }
      }
    },
    [monteurSession, notify]
  );

  const handleExpireUnconfirmedClaim = useCallback(
    async (mission: AssignedMissionRecord) => {
      if (!monteurSession) return;
      if (expiringTaskIdsRef.current.has(mission.taskId)) return;
      expiringTaskIdsRef.current.add(mission.taskId);

      const { credId } = monteurSession;
      const vis: TaskVisibility = mission.Visibilite ?? 'Tous';

      try {
        const inviteRef = doc(db, 'monteur_credentials', credId, 'invites', mission.taskId);
        const existingInviteSnap = vis === 'Selection' ? await getDoc(inviteRef) : null;

        const batch = writeBatch(db);
        batch.update(doc(db, 'tasks', mission.taskId), {
          Statut: 'Ouverte',
          Ouverte_Pour_Tous: vis === 'Tous',
          Monteur_Valide_Email: '',
          Monteur_Valide_Nom: '',
          Monteur_Cred_Id: '',
          Claim_Deadline_Ms: 0,
          WhatsApp_Contacte: false,
          Chef_Monteur_Confirme: false,
          updatedAt: serverTimestamp(),
        });
        batch.delete(doc(db, 'monteur_credentials', credId, 'missions', mission.taskId));
        if (vis === 'Selection') {
          const inviteFields = {
            taskId: mission.taskId,
            ID_Tache: mission.ID_Tache,
            Titre_Projet: mission.Titre_Projet,
            Style_Montage: mission.Style_Montage,
            Duree_Video: mission.Duree_Video,
            Deadline: mission.Deadline,
            Prix_DZD: mission.Prix_DZD,
            Lien_Fichiers: mission.Lien_Fichiers,
            updatedAt: serverTimestamp(),
          };
          if (existingInviteSnap?.exists()) {
            batch.update(inviteRef, inviteFields);
          } else {
            batch.set(inviteRef, {
              ...inviteFields,
              createdAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
        notify(
          'info',
          `Délai de 5 minutes expiré sans message WhatsApp : la mission ${mission.ID_Tache} est réouverte aux autres monteurs.`
        );
      } catch {
        // Server clock may be a few seconds behind client clock; next tick will retry
      } finally {
        window.setTimeout(() => {
          expiringTaskIdsRef.current.delete(mission.taskId);
        }, 2500);
      }
    },
    [monteurSession, notify]
  );

  const handleHideMission = async (taskId: string) => {
    if (!monteurSession) return;
    const nextHidden = Array.from(new Set([...hiddenTaskIds, taskId])).slice(
      0,
      TASK_CONSTRAINTS.MAX_HIDDEN_TASKS
    );
    const path = `monteur_credentials/${monteurSession.credId}/prefs/hidden`;
    try {
      await setDoc(doc(db, 'monteur_credentials', monteurSession.credId, 'prefs', 'hidden'), {
        hiddenTaskIds: nextHidden,
        updatedAt: serverTimestamp(),
      });
      setMonteurNotifications((prev) => {
        const next = prev.map((n) => (n.taskId === taskId ? { ...n, read: true } : n));
        try {
          window.localStorage.setItem(
            `pmv_notif_items_${monteurSession.credId}`,
            JSON.stringify(next)
          );
        } catch {
          // Ignore
        }
        return next;
      });
      notify('info', 'Mission masquée.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleRestoreHiddenMissions = async () => {
    if (!monteurSession) return;
    const path = `monteur_credentials/${monteurSession.credId}/prefs/hidden`;
    try {
      await setDoc(doc(db, 'monteur_credentials', monteurSession.credId, 'prefs', 'hidden'), {
        hiddenTaskIds: [],
        updatedAt: serverTimestamp(),
      });
      notify('success', 'Missions masquées réaffichées.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  // Helper: keep targeted monteur invite subcollections synchronized without overwriting existing createdAt
  const syncTaskInvitesInBatchAsync = async (
    batch: WriteBatch,
    taskId: string,
    payload: {
      ID_Tache: string;
      Titre_Projet: string;
      Style_Montage: string;
      Duree_Video: string;
      Deadline: string;
      Prix_DZD: number;
      Lien_Fichiers: string;
    },
    nextPhones: string[],
    prevPhones: string[]
  ) => {
    const nextSet = new Set(nextPhones.map((p) => normalizePhone(p)).filter(Boolean));
    const prevSet = new Set(prevPhones.map((p) => normalizePhone(p)).filter(Boolean));
    const toUpsert = adminMonteurs.filter((m) => nextSet.has(normalizePhone(m.phone)));

    const existingSnaps = await Promise.all(
      toUpsert.map((m) => getDoc(doc(db, 'monteur_credentials', m.credId, 'invites', taskId)))
    );

    toUpsert.forEach((monteur, idx) => {
      const ref = doc(db, 'monteur_credentials', monteur.credId, 'invites', taskId);
      const inviteFields = {
        taskId,
        ID_Tache: payload.ID_Tache,
        Titre_Projet: payload.Titre_Projet,
        Style_Montage: payload.Style_Montage,
        Duree_Video: payload.Duree_Video,
        Deadline: payload.Deadline,
        Prix_DZD: Math.round(payload.Prix_DZD),
        Lien_Fichiers: payload.Lien_Fichiers,
        updatedAt: serverTimestamp(),
      };
      if (existingSnaps[idx]?.exists()) {
        batch.update(ref, inviteFields);
      } else {
        batch.set(ref, {
          ...inviteFields,
          createdAt: serverTimestamp(),
        });
      }
    });

    for (const monteur of adminMonteurs) {
      const normPhone = normalizePhone(monteur.phone);
      if (!nextSet.has(normPhone) && prevSet.has(normPhone)) {
        batch.delete(doc(db, 'monteur_credentials', monteur.credId, 'invites', taskId));
      }
    }
  };

  const upsertAssignedMissionInBatchAsync = async (
    batch: WriteBatch,
    credId: string,
    taskId: string,
    fields: {
      ID_Tache: string;
      Titre_Projet: string;
      Style_Montage: string;
      Duree_Video: string;
      Deadline: string;
      Prix_DZD: number;
      Statut: AssignedWorkflowStatus;
      Lien_Fichiers: string;
      Visibilite: TaskVisibility;
      Claim_Deadline_Ms: number;
      WhatsApp_Contacte: boolean;
      Chef_Monteur_Confirme: boolean;
    }
  ) => {
    const missionRef = doc(db, 'monteur_credentials', credId, 'missions', taskId);
    const snap = await getDoc(missionRef);
    const payload = {
      taskId,
      ID_Tache: fields.ID_Tache,
      Titre_Projet: fields.Titre_Projet,
      Style_Montage: fields.Style_Montage,
      Duree_Video: fields.Duree_Video,
      Deadline: fields.Deadline,
      Prix_DZD: Math.round(fields.Prix_DZD),
      Statut: fields.Statut,
      Lien_Fichiers: fields.Lien_Fichiers,
      Visibilite: fields.Visibilite,
      Claim_Deadline_Ms: fields.Claim_Deadline_Ms,
      WhatsApp_Contacte: fields.WhatsApp_Contacte,
      Chef_Monteur_Confirme: fields.Chef_Monteur_Confirme,
      updatedAt: serverTimestamp(),
    };
    if (snap.exists()) {
      batch.update(missionRef, payload);
    } else {
      batch.set(missionRef, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  };

  const getEligibleEmailRecipients = useCallback(
    (visibilite: TaskVisibility, monteursAutorises: string[]) => {
      const allowedSet = new Set(
        monteursAutorises.map((p) => normalizePhone(p)).filter(Boolean)
      );
      return adminMonteurs
        .filter((m) => {
          if (!m.active) return false;
          if (!isValidEmail(m.email ?? '')) return false;
          if (visibilite === 'Selection') {
            return allowedSet.has(normalizePhone(m.phone));
          }
          return true;
        })
        .map((m) => ({
          nom: m.nom,
          email: normalizeEmail(m.email ?? ''),
        }));
    },
    [adminMonteurs]
  );

  const sendTaskEmailNotifications = useCallback(
    async (
      params: {
        idTache: string;
        titreProjet: string;
        styleMontage: string;
        dureeVideo: string;
        deadline: string;
        prixDZD: number;
        visibilite: TaskVisibility;
        recipients: { nom: string; email: string }[];
      },
      explicitGmailToken?: string | null
    ): Promise<{
      configured: boolean;
      provider: 'smtp' | 'resend' | 'gmail' | null;
      sentCount: number;
      failedCount: number;
      totalRecipients: number;
      gmailAuthExpired: boolean;
      errorDetail?: string;
    }> => {
      if (!adminUser) {
        return {
          configured: false,
          provider: null,
          sentCount: 0,
          failedCount: 0,
          totalRecipients: 0,
          gmailAuthExpired: false,
        };
      }
      if (params.recipients.length === 0) {
        return {
          configured: Boolean(emailProviderConfigured || gmailConnected),
          provider: null,
          sentCount: 0,
          failedCount: 0,
          totalRecipients: 0,
          gmailAuthExpired: false,
        };
      }

      const gmailAccessToken = explicitGmailToken ?? getCachedGmailAccessToken();

      try {
        const token = await adminUser.getIdToken();
        const portalUrl = `${window.location.origin}/?espace=monteur`;
        const resp = await fetch('/api/send-task-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            task: {
              idTache: params.idTache,
              titreProjet: params.titreProjet,
              styleMontage: params.styleMontage,
              dureeVideo: params.dureeVideo,
              deadline: params.deadline,
              prixDZD: params.prixDZD,
              visibilite: params.visibilite,
              portalUrl,
            },
            recipients: params.recipients,
            gmailAccessToken: gmailAccessToken || undefined,
          }),
        });

        if (!resp.ok) {
          return {
            configured: Boolean(emailProviderConfigured || gmailAccessToken),
            provider: null,
            sentCount: 0,
            failedCount: params.recipients.length,
            totalRecipients: params.recipients.length,
            gmailAuthExpired: false,
          };
        }

        const result = (await resp.json()) as {
          configured?: boolean;
          provider?: 'smtp' | 'resend' | 'gmail' | null;
          sentCount?: number;
          failedCount?: number;
          totalRecipients?: number;
          gmailAuthExpired?: boolean;
          errorDetail?: string;
        };

        if (result.gmailAuthExpired) {
          setCachedGmailAccessToken(null);
          setGmailConnected(false);
        }

        return {
          configured: Boolean(result.configured),
          provider: result.provider ?? null,
          sentCount: result.sentCount ?? 0,
          failedCount: result.failedCount ?? 0,
          totalRecipients: result.totalRecipients ?? params.recipients.length,
          gmailAuthExpired: Boolean(result.gmailAuthExpired),
          errorDetail: result.errorDetail,
        };
      } catch {
        return {
          configured: Boolean(emailProviderConfigured || gmailAccessToken),
          provider: null,
          sentCount: 0,
          failedCount: params.recipients.length,
          totalRecipients: params.recipients.length,
          gmailAuthExpired: false,
        };
      }
    },
    [adminUser, emailProviderConfigured, gmailConnected]
  );

  const handleConfirmPendingEmailSend = useCallback(
    async (dispatch: PendingEmailDispatch) => {
      let gmailToken = getCachedGmailAccessToken();
      if (!emailProviderConfigured && !gmailToken) {
        gmailToken = await handleConnectGmail();
        if (!gmailToken) return;
      }

      const emailRes = await sendTaskEmailNotifications(dispatch, gmailToken);
      if (emailRes.gmailAuthExpired) {
        notify(
          'error',
          'Votre session Gmail a expiré. Cliquez à nouveau sur « Autoriser Gmail et envoyer ».'
        );
        return;
      }

      if (emailRes.sentCount > 0) {
        notify(
          'success',
          `${emailRes.sentCount} e-mail(s) envoyé(s) avec succès via ${
            emailRes.provider === 'gmail' ? 'Gmail' : 'le serveur e-mail'
          }${emailRes.failedCount > 0 ? ` (${emailRes.failedCount} échec(s))` : ''}.`
        );
        setPendingEmailConfirm(null);
      } else if (emailRes.failedCount > 0) {
        notify(
          'error',
          `Échec de l’envoi d’e-mail : ${emailRes.errorDetail || 'vérifiez la connexion Gmail.'}`
        );
      } else {
        setPendingEmailConfirm(null);
      }
    },
    [emailProviderConfigured, handleConnectGmail, notify, sendTaskEmailNotifications]
  );

  // Admin Task Actions
  const handleCreateTask = async (payload: TaskFormPayload, sendEmail = true) => {
    const docId = makeDocId(payload.ID_Tache);
    const path = `tasks/${docId}`;
    try {
      const batch = writeBatch(db);
      const rawPhones =
        payload.Visibilite === 'Selection'
          ? payload.Monteurs_Autorises.map((p) => normalizePhone(p)).filter(Boolean)
          : [];
      const nextVis: TaskVisibility = payload.Visibilite === 'Selection' ? 'Selection' : 'Tous';
      const allowedPhones = nextVis === 'Selection' ? Array.from(new Set(rawPhones)) : [];
      const prixInt = Math.round(payload.Prix_DZD);

      batch.set(doc(db, 'tasks', docId), {
        ...payload,
        Prix_DZD: prixInt,
        Visibilite: nextVis,
        Monteurs_Autorises: allowedPhones,
        Ouverte_Pour_Tous: nextVis === 'Tous',
        Statut: 'Ouverte',
        Monteur_Valide_Email: '',
        Monteur_Valide_Nom: '',
        Monteur_Cred_Id: '',
        Claim_Deadline_Ms: 0,
        WhatsApp_Contacte: false,
        Chef_Monteur_Confirme: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (nextVis === 'Selection' && allowedPhones.length > 0) {
        await syncTaskInvitesInBatchAsync(batch, docId, { ...payload, Prix_DZD: prixInt }, allowedPhones, []);
      }
      await batch.commit();

      const recipients = sendEmail ? getEligibleEmailRecipients(nextVis, allowedPhones) : [];

      let emailSummary = '';
      if (sendEmail && recipients.length === 0) {
        emailSummary = ' · Aucun monteur concerné n’a d’e-mail enregistré.';
      } else if (sendEmail && recipients.length > 0) {
        if (emailProviderConfigured === true) {
          const emailRes = await sendTaskEmailNotifications({
            idTache: payload.ID_Tache,
            titreProjet: payload.Titre_Projet,
            styleMontage: payload.Style_Montage,
            dureeVideo: payload.Duree_Video,
            deadline: payload.Deadline,
            prixDZD: prixInt,
            visibilite: nextVis,
            recipients,
          });
          if (emailRes.sentCount > 0) {
            emailSummary = ` · E-mail envoyé à ${emailRes.sentCount} monteur(s).`;
          }
        } else {
          setPendingEmailConfirm({
            idTache: payload.ID_Tache,
            titreProjet: payload.Titre_Projet,
            styleMontage: payload.Style_Montage,
            dureeVideo: payload.Duree_Video,
            deadline: payload.Deadline,
            prixDZD: prixInt,
            visibilite: nextVis,
            recipients,
          });
        }
      }

      notify(
        'success',
        nextVis === 'Selection'
          ? `Mission ${payload.ID_Tache} publiée et notifiée à ${allowedPhones.length} monteur(s)${emailSummary}`
          : `Mission ${payload.ID_Tache} publiée et notifiée à tous les monteurs${emailSummary}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateTask = async (taskId: string, payload: TaskFormPayload) => {
    let existing = adminTasks.find((t) => t.id === taskId);
    const path = `tasks/${taskId}`;
    try {
      if (!existing) {
        const snap = await getDoc(doc(db, 'tasks', taskId));
        if (snap.exists()) {
          existing = { id: snap.id, ...(snap.data() as Omit<TaskRecord, 'id'>) };
        }
      }

      const batch = writeBatch(db);
      const currentStatus = normalizeTaskStatus(existing?.Statut ?? 'Ouverte');
      const isOpen = currentStatus === 'Ouverte';
      const rawPhones =
        payload.Visibilite === 'Selection'
          ? payload.Monteurs_Autorises.map((p) => normalizePhone(p)).filter(Boolean)
          : [];
      const nextVis: TaskVisibility = payload.Visibilite === 'Selection' ? 'Selection' : 'Tous';
      const allowedPhones = nextVis === 'Selection' ? Array.from(new Set(rawPhones)) : [];
      const prevPhones = existing?.Monteurs_Autorises ?? [];
      const prixInt = Math.round(payload.Prix_DZD);
      const claimDeadlineMs = isOpen ? 0 : (existing?.Claim_Deadline_Ms ?? 0);
      const whatsappContacted = isOpen ? false : (existing?.WhatsApp_Contacte ?? true);
      const chefConfirmed = isOpen
        ? false
        : (existing?.Chef_Monteur_Confirme ?? (currentStatus !== 'Assigned'));

      batch.update(doc(db, 'tasks', taskId), {
        ...payload,
        Prix_DZD: prixInt,
        Statut: currentStatus,
        Visibilite: nextVis,
        Monteurs_Autorises: allowedPhones,
        Ouverte_Pour_Tous: isOpen && nextVis === 'Tous',
        Monteur_Valide_Email: isOpen ? '' : (existing?.Monteur_Valide_Email ?? ''),
        Monteur_Valide_Nom: isOpen ? '' : (existing?.Monteur_Valide_Nom ?? ''),
        Monteur_Cred_Id: isOpen ? '' : (existing?.Monteur_Cred_Id ?? ''),
        Claim_Deadline_Ms: claimDeadlineMs,
        WhatsApp_Contacte: whatsappContacted,
        Chef_Monteur_Confirme: chefConfirmed,
        updatedAt: serverTimestamp(),
      });

      if (isOpen) {
        await syncTaskInvitesInBatchAsync(
          batch,
          taskId,
          { ...payload, Prix_DZD: prixInt },
          allowedPhones,
          prevPhones
        );
      } else {
        await syncTaskInvitesInBatchAsync(
          batch,
          taskId,
          { ...payload, Prix_DZD: prixInt },
          [],
          prevPhones
        );
      }

      if (existing && existing.Monteur_Cred_Id && !isOpen) {
        await upsertAssignedMissionInBatchAsync(batch, existing.Monteur_Cred_Id, taskId, {
          ID_Tache: payload.ID_Tache,
          Titre_Projet: payload.Titre_Projet,
          Style_Montage: payload.Style_Montage,
          Duree_Video: payload.Duree_Video,
          Deadline: payload.Deadline,
          Prix_DZD: prixInt,
          Statut: normalizeAssignedStatus(currentStatus),
          Lien_Fichiers: payload.Lien_Fichiers,
          Visibilite: nextVis,
          Claim_Deadline_Ms: claimDeadlineMs,
          WhatsApp_Contacte: whatsappContacted,
          Chef_Monteur_Confirme: chefConfirmed,
        });
      }
      await batch.commit();
      notify('success', `Mission ${payload.ID_Tache} mise à jour.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleConfirmChefMonteur = async (task: TaskRecord) => {
    const path = `tasks/${task.id}`;
    try {
      const batch = writeBatch(db);
      const nextStatus = normalizeAssignedStatus(task.Statut);
      const rawAllowed = Array.isArray(task.Monteurs_Autorises) ? task.Monteurs_Autorises : [];
      const vis: TaskVisibility =
        task.Visibilite === 'Selection' && rawAllowed.length > 0 ? 'Selection' : 'Tous';
      const allowed = vis === 'Selection' ? rawAllowed : [];

      batch.update(doc(db, 'tasks', task.id), {
        Statut: nextStatus,
        Visibilite: vis,
        Monteurs_Autorises: allowed,
        Ouverte_Pour_Tous: false,
        WhatsApp_Contacte: true,
        Chef_Monteur_Confirme: true,
        Claim_Deadline_Ms: 0,
        updatedAt: serverTimestamp(),
      });
      if (task.Monteur_Cred_Id) {
        await upsertAssignedMissionInBatchAsync(batch, task.Monteur_Cred_Id, task.id, {
          ID_Tache: task.ID_Tache,
          Titre_Projet: task.Titre_Projet,
          Style_Montage: task.Style_Montage,
          Duree_Video: task.Duree_Video,
          Deadline: task.Deadline,
          Prix_DZD: task.Prix_DZD,
          Statut: nextStatus,
          Lien_Fichiers: task.Lien_Fichiers,
          Visibilite: vis,
          Claim_Deadline_Ms: 0,
          WhatsApp_Contacte: true,
          Chef_Monteur_Confirme: true,
        });
      }
      await batch.commit();
      notify(
        'success',
        `Confirmation enregistrée pour ${task.ID_Tache} : ${task.Monteur_Valide_Nom || 'le monteur'} peut maintenant cliquer sur « Commencer le montage ».`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleChangeTaskStatus = async (
    task: TaskRecord,
    nextStatus: AssignedWorkflowStatus
  ) => {
    const path = `tasks/${task.id}`;
    try {
      const batch = writeBatch(db);
      const nextClaimDeadline = nextStatus === 'Assigned' ? (task.Claim_Deadline_Ms ?? 0) : 0;
      const nextChefConfirmed =
        nextStatus === 'Assigned' ? (task.Chef_Monteur_Confirme ?? false) : true;
      const nextWhatsappContacted =
        nextStatus === 'Assigned' ? (task.WhatsApp_Contacte ?? true) : true;
      const rawAllowed = Array.isArray(task.Monteurs_Autorises) ? task.Monteurs_Autorises : [];
      const vis: TaskVisibility =
        task.Visibilite === 'Selection' && rawAllowed.length > 0 ? 'Selection' : 'Tous';
      const allowed = vis === 'Selection' ? rawAllowed : [];

      batch.update(doc(db, 'tasks', task.id), {
        Statut: nextStatus,
        Visibilite: vis,
        Monteurs_Autorises: allowed,
        Ouverte_Pour_Tous: false,
        Claim_Deadline_Ms: nextClaimDeadline,
        WhatsApp_Contacte: nextWhatsappContacted,
        Chef_Monteur_Confirme: nextChefConfirmed,
        updatedAt: serverTimestamp(),
      });
      if (task.Monteur_Cred_Id) {
        await upsertAssignedMissionInBatchAsync(batch, task.Monteur_Cred_Id, task.id, {
          ID_Tache: task.ID_Tache,
          Titre_Projet: task.Titre_Projet,
          Style_Montage: task.Style_Montage,
          Duree_Video: task.Duree_Video,
          Deadline: task.Deadline,
          Prix_DZD: task.Prix_DZD,
          Statut: nextStatus,
          Lien_Fichiers: task.Lien_Fichiers,
          Visibilite: vis,
          Claim_Deadline_Ms: nextClaimDeadline,
          WhatsApp_Contacte: nextWhatsappContacted,
          Chef_Monteur_Confirme: nextChefConfirmed,
        });
      }
      await syncTaskInvitesInBatchAsync(batch, task.id, task, [], rawAllowed);
      await batch.commit();
      notify(
        'success',
        nextStatus === 'Done'
          ? `Mission ${task.ID_Tache} marquée Done. Compteur DZD crédité !`
          : `Statut de ${task.ID_Tache} mis à jour : ${nextStatus}.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleReopenTask = async (task: TaskRecord, autoExpired = false) => {
    const path = `tasks/${task.id}`;
    try {
      const batch = writeBatch(db);
      const rawAllowed = Array.isArray(task.Monteurs_Autorises)
        ? task.Monteurs_Autorises.map((p) => normalizePhone(p)).filter(Boolean)
        : [];
      const vis: TaskVisibility = task.Visibilite === 'Selection' ? 'Selection' : 'Tous';
      const allowedPhones = vis === 'Selection' ? Array.from(new Set(rawAllowed)) : [];

      batch.update(doc(db, 'tasks', task.id), {
        Statut: 'Ouverte',
        Visibilite: vis,
        Monteurs_Autorises: allowedPhones,
        Ouverte_Pour_Tous: vis === 'Tous',
        Monteur_Valide_Email: '',
        Monteur_Valide_Nom: '',
        Monteur_Cred_Id: '',
        Claim_Deadline_Ms: 0,
        WhatsApp_Contacte: false,
        Chef_Monteur_Confirme: false,
        updatedAt: serverTimestamp(),
      });
      if (task.Monteur_Cred_Id) {
        batch.delete(doc(db, 'monteur_credentials', task.Monteur_Cred_Id, 'missions', task.id));
      }
      if (vis === 'Selection' && allowedPhones.length > 0) {
        await syncTaskInvitesInBatchAsync(batch, task.id, task, allowedPhones, []);
      }
      await batch.commit();
      const recipients = getEligibleEmailRecipients(vis, allowedPhones);
      let emailNote = '';
      if (!autoExpired && recipients.length > 0) {
        if (emailProviderConfigured === true) {
          const emailRes = await sendTaskEmailNotifications({
            idTache: task.ID_Tache,
            titreProjet: task.Titre_Projet,
            styleMontage: task.Style_Montage,
            dureeVideo: task.Duree_Video,
            deadline: task.Deadline,
            prixDZD: task.Prix_DZD,
            visibilite: vis,
            recipients,
          });
          if (emailRes.sentCount > 0) {
            emailNote = ` (${emailRes.sentCount} e-mail(s) envoyé(s))`;
          }
        } else {
          setPendingEmailConfirm({
            idTache: task.ID_Tache,
            titreProjet: task.Titre_Projet,
            styleMontage: task.Style_Montage,
            dureeVideo: task.Duree_Video,
            deadline: task.Deadline,
            prixDZD: task.Prix_DZD,
            visibilite: vis,
            recipients,
          });
        }
      } else if (autoExpired && recipients.length > 0 && (emailProviderConfigured === true || getCachedGmailAccessToken())) {
        const emailRes = await sendTaskEmailNotifications({
          idTache: task.ID_Tache,
          titreProjet: task.Titre_Projet,
          styleMontage: task.Style_Montage,
          dureeVideo: task.Duree_Video,
          deadline: task.Deadline,
          prixDZD: task.Prix_DZD,
          visibilite: vis,
          recipients,
        });
        if (emailRes.sentCount > 0) {
          emailNote = ` (${emailRes.sentCount} e-mail(s) envoyé(s))`;
        }
      }
      notify(
        'info',
        autoExpired
          ? `Mission ${task.ID_Tache} réouverte automatiquement (délai WhatsApp de 5 min expiré)${emailNote}.`
          : `Mission ${task.ID_Tache} réouverte aux monteurs${emailNote}.`
      );
    } catch (err) {
      if (!autoExpired) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const handleDeleteTask = async (task: TaskRecord) => {
    const path = `tasks/${task.id}`;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'tasks', task.id));
      if (task.Monteur_Cred_Id) {
        batch.delete(doc(db, 'monteur_credentials', task.Monteur_Cred_Id, 'missions', task.id));
      }
      await syncTaskInvitesInBatchAsync(batch, task.id, task, [], task.Monteurs_Autorises ?? []);
      await batch.commit();
      notify('info', `Mission ${task.ID_Tache} supprimée.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleNotifyMonteursForTask = async (task: TaskRecord) => {
    const path = `tasks/${task.id}`;
    try {
      const batch = writeBatch(db);
      const rawAllowed = Array.isArray(task.Monteurs_Autorises)
        ? task.Monteurs_Autorises.map((p) => normalizePhone(p)).filter(Boolean)
        : [];
      const vis: TaskVisibility = task.Visibilite === 'Selection' ? 'Selection' : 'Tous';
      const allowedPhones = vis === 'Selection' ? Array.from(new Set(rawAllowed)) : [];

      batch.update(doc(db, 'tasks', task.id), {
        Statut: 'Ouverte',
        Visibilite: vis,
        Monteurs_Autorises: allowedPhones,
        Ouverte_Pour_Tous: vis === 'Tous',
        Monteur_Valide_Email: '',
        Monteur_Valide_Nom: '',
        Monteur_Cred_Id: '',
        Claim_Deadline_Ms: 0,
        WhatsApp_Contacte: false,
        Chef_Monteur_Confirme: false,
        updatedAt: serverTimestamp(),
      });

      if (vis === 'Selection' && allowedPhones.length > 0) {
        await syncTaskInvitesInBatchAsync(batch, task.id, task, allowedPhones, []);
      }

      await batch.commit();

      const recipients = getEligibleEmailRecipients(vis, allowedPhones);
      let emailSuffix = '';
      if (recipients.length > 0) {
        let gmailToken = getCachedGmailAccessToken();
        if (emailProviderConfigured !== true && !gmailToken) {
          gmailToken = await handleConnectGmail();
        }
        if (emailProviderConfigured === true || gmailToken) {
          const emailRes = await sendTaskEmailNotifications(
            {
              idTache: task.ID_Tache,
              titreProjet: task.Titre_Projet,
              styleMontage: task.Style_Montage,
              dureeVideo: task.Duree_Video,
              deadline: task.Deadline,
              prixDZD: task.Prix_DZD,
              visibilite: vis,
              recipients,
            },
            gmailToken
          );
          if (emailRes.sentCount > 0) {
            emailSuffix = ` + ${emailRes.sentCount} e-mail(s) envoyé(s) via ${
              emailRes.provider === 'gmail' ? 'Gmail' : 'e-mail'
            }`;
          } else if (emailRes.failedCount > 0) {
            emailSuffix = ` (erreur e-mail : ${emailRes.errorDetail || 'échec de l’envoi'})`;
          }
        } else {
          emailSuffix = ' (e-mail non autorisé pour Gmail)';
        }
      } else if (vis === 'Selection') {
        emailSuffix = ' (aucun monteur sélectionné avec e-mail)';
      }

      notify(
        'success',
        vis === 'Selection'
          ? `Notification envoyée en direct aux ${allowedPhones.length} monteur(s) sélectionné(s) pour ${task.ID_Tache}${emailSuffix}.`
          : `Notification envoyée en direct à tous les monteurs pour ${task.ID_Tache}${emailSuffix}.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Admin Monteur Accounts Management
  const handleCreateMonteur = async (payload: MonteurAccountFormPayload) => {
    const duplicate = adminMonteurs.find((m) => m.phone === payload.phone);
    if (duplicate) {
      notify('error', `Un compte existe déjà pour le numéro ${payload.phone}.`);
      return;
    }

    const cleanEmail = normalizeEmail(payload.email);

    try {
      const credId = await deriveCredentialId(payload.phone, payload.accessCode);
      const accountId = makeDocId('mnt');
      const batch = writeBatch(db);

      batch.set(doc(db, 'monteur_accounts', accountId), {
        nom: payload.nom,
        phone: payload.phone,
        email: cleanEmail,
        accessCode: payload.accessCode,
        credId,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'monteur_credentials', credId), {
        phone: payload.phone,
        nom: payload.nom,
        active: true,
        disponible: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      notify('success', `Accès créé pour ${payload.nom} (Code : ${payload.accessCode}).`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'monteur_accounts');
    }
  };

  const handleUpdateMonteurEmail = async (account: MonteurAccountRecord, rawEmail: string) => {
    const cleanEmail = normalizeEmail(rawEmail);
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      notify('error', 'Adresse e-mail invalide.');
      return;
    }
    try {
      await updateDoc(doc(db, 'monteur_accounts', account.id), {
        email: cleanEmail,
        updatedAt: serverTimestamp(),
      });
      notify(
        'success',
        cleanEmail
          ? `E-mail de ${account.nom} mis à jour : ${cleanEmail}.`
          : `E-mail de ${account.nom} retiré.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `monteur_accounts/${account.id}`);
    }
  };

  const handleToggleMonteurActive = async (account: MonteurAccountRecord) => {
    const nextActive = !account.active;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'monteur_accounts', account.id), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'monteur_credentials', account.credId), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      notify('info', `${account.nom} est maintenant ${nextActive ? 'actif' : 'désactivé'}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `monteur_accounts/${account.id}`);
    }
  };

  const handleRegenerateMonteurCode = async (
    account: MonteurAccountRecord,
    newCode: string
  ) => {
    try {
      const newCredId = await deriveCredentialId(account.phone, newCode);
      if (newCredId === account.credId) {
        notify('info', 'Le code d’accès est inchangé.');
        return;
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, 'monteur_credentials', account.credId));
      batch.set(doc(db, 'monteur_credentials', newCredId), {
        phone: account.phone,
        nom: account.nom,
        active: account.active,
        disponible: credAvailability[account.credId] ?? account.disponible !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'monteur_accounts', account.id), {
        accessCode: newCode,
        credId: newCredId,
        updatedAt: serverTimestamp(),
      });
      for (const task of adminTasks) {
        if (
          task.Statut === 'Ouverte' &&
          task.Visibilite === 'Selection' &&
          (task.Monteurs_Autorises ?? []).includes(account.phone)
        ) {
          batch.delete(doc(db, 'monteur_credentials', account.credId, 'invites', task.id));
          batch.set(doc(db, 'monteur_credentials', newCredId, 'invites', task.id), {
            taskId: task.id,
            ID_Tache: task.ID_Tache,
            Titre_Projet: task.Titre_Projet,
            Style_Montage: task.Style_Montage,
            Duree_Video: task.Duree_Video,
            Deadline: task.Deadline,
            Prix_DZD: task.Prix_DZD,
            Lien_Fichiers: task.Lien_Fichiers,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
      notify('success', `Nouveau code pour ${account.nom} : ${newCode}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `monteur_accounts/${account.id}`);
    }
  };

  const handleDeleteMonteur = async (account: MonteurAccountRecord) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'monteur_accounts', account.id));
      batch.delete(doc(db, 'monteur_credentials', account.credId));
      await batch.commit();
      notify('info', `Accès de ${account.nom} supprimé.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `monteur_accounts/${account.id}`);
    }
  };

  const handleSeedDemoTasks = async () => {
    try {
      const existingIds = new Set(adminTasks.map((t) => t.ID_Tache.toUpperCase()));
      const toCreate = DEMO_SEED_TASKS.filter((t) => !existingIds.has(t.ID_Tache.toUpperCase()));
      if (toCreate.length === 0) {
        notify('info', 'Les missions d’exemple T-001 à T-004 existent déjà.');
        return;
      }
      const batch = writeBatch(db);
      for (const item of toCreate) {
        const docId = makeDocId(item.ID_Tache);
        batch.set(doc(db, 'tasks', docId), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      notify('success', `${toCreate.length} mission(s) d’exemple ajoutée(s).`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const handleImportCsvTasks = async (parsedTasks: ParsedCsvTask[]) => {
    try {
      const existingByCode = new Map(adminTasks.map((t) => [t.ID_Tache.toUpperCase(), t]));
      const batch = writeBatch(db);

      for (const item of parsedTasks) {
        const existing = existingByCode.get(item.ID_Tache.toUpperCase());
        const taskId = existing ? existing.id : makeDocId(item.ID_Tache);
        const nextVis: TaskVisibility =
          item.Visibilite === 'Selection' && item.Monteurs_Autorises.length > 0
            ? 'Selection'
            : 'Tous';
        const allowedPhones = nextVis === 'Selection' ? item.Monteurs_Autorises : [];
        const prixInt = Math.round(item.Prix_DZD);

        if (existing) {
          const currentStatus = normalizeTaskStatus(existing.Statut);
          const isOpen = currentStatus === 'Ouverte';
          const claimDeadlineMs = isOpen ? 0 : (existing.Claim_Deadline_Ms ?? 0);
          const whatsappContacted = isOpen ? false : (existing.WhatsApp_Contacte ?? true);
          const chefConfirmed = isOpen
            ? false
            : (existing.Chef_Monteur_Confirme ?? (currentStatus !== 'Assigned'));

          batch.update(doc(db, 'tasks', taskId), {
            ID_Tache: item.ID_Tache,
            Titre_Projet: item.Titre_Projet,
            Style_Montage: item.Style_Montage,
            Duree_Video: item.Duree_Video,
            Deadline: item.Deadline,
            Prix_DZD: prixInt,
            Statut: currentStatus,
            Lien_Fichiers: item.Lien_Fichiers,
            Visibilite: nextVis,
            Monteurs_Autorises: allowedPhones,
            Ouverte_Pour_Tous: isOpen && nextVis === 'Tous',
            Claim_Deadline_Ms: claimDeadlineMs,
            WhatsApp_Contacte: whatsappContacted,
            Chef_Monteur_Confirme: chefConfirmed,
            updatedAt: serverTimestamp(),
          });
          await syncTaskInvitesInBatchAsync(
            batch,
            taskId,
            { ...item, Prix_DZD: prixInt },
            isOpen && nextVis === 'Selection' ? allowedPhones : [],
            existing.Monteurs_Autorises ?? []
          );
          if (existing.Monteur_Cred_Id && !isOpen) {
            await upsertAssignedMissionInBatchAsync(batch, existing.Monteur_Cred_Id, taskId, {
              ID_Tache: item.ID_Tache,
              Titre_Projet: item.Titre_Projet,
              Style_Montage: item.Style_Montage,
              Duree_Video: item.Duree_Video,
              Deadline: item.Deadline,
              Prix_DZD: prixInt,
              Statut: normalizeAssignedStatus(currentStatus),
              Lien_Fichiers: item.Lien_Fichiers,
              Visibilite: nextVis,
              Claim_Deadline_Ms: claimDeadlineMs,
              WhatsApp_Contacte: whatsappContacted,
              Chef_Monteur_Confirme: chefConfirmed,
            });
          }
        } else {
          batch.set(doc(db, 'tasks', taskId), {
            ID_Tache: item.ID_Tache,
            Titre_Projet: item.Titre_Projet,
            Style_Montage: item.Style_Montage,
            Duree_Video: item.Duree_Video,
            Deadline: item.Deadline,
            Prix_DZD: prixInt,
            Statut: 'Ouverte',
            Monteur_Valide_Email: '',
            Monteur_Valide_Nom: '',
            Monteur_Cred_Id: '',
            Lien_Fichiers: item.Lien_Fichiers,
            Visibilite: nextVis,
            Monteurs_Autorises: allowedPhones,
            Ouverte_Pour_Tous: nextVis === 'Tous',
            Claim_Deadline_Ms: 0,
            WhatsApp_Contacte: false,
            Chef_Monteur_Confirme: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (nextVis === 'Selection' && allowedPhones.length > 0) {
            await syncTaskInvitesInBatchAsync(
              batch,
              taskId,
              { ...item, Prix_DZD: prixInt },
              allowedPhones,
              []
            );
          }
        }
      }

      await batch.commit();
      notify('success', `${parsedTasks.length} mission(s) synchronisée(s) depuis le CSV.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const reopenTaskRef = useRef(handleReopenTask);
  reopenTaskRef.current = handleReopenTask;

  // Admin background watcher: automatically reopen any unconfirmed claim once 5 minutes expire
  useEffect(() => {
    if (!authReady || !isAdmin) return;
    const checkExpired = () => {
      const now = Date.now();
      for (const t of adminTasks) {
        if (
          normalizeTaskStatus(t.Statut) === 'Assigned' &&
          t.WhatsApp_Contacte === false &&
          (t.Claim_Deadline_Ms ?? 0) > 0 &&
          now >= (t.Claim_Deadline_Ms ?? 0) &&
          !expiringTaskIdsRef.current.has(t.id)
        ) {
          expiringTaskIdsRef.current.add(t.id);
          void reopenTaskRef.current(t, true).finally(() => {
            window.setTimeout(() => {
              expiringTaskIdsRef.current.delete(t.id);
            }, 3000);
          });
        }
      }
    };
    checkExpired();
    const timer = window.setInterval(checkExpired, 3000);
    return () => window.clearInterval(timer);
  }, [authReady, isAdmin, adminTasks]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F6F6F6] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#9A3412] border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-medium text-neutral-600">Chargement du portail...</p>
        </div>
      </div>
    );
  }

  // Determine which view is active:
  // 1. If inMonteurPortalMode (?espace=monteur or Admin clicked "Espace Monteur"):
  //    Show MonteurDashboard ONLY if monteurSession is authenticated; otherwise ALWAYS show Monteur Phone+Code LoginScreen!
  // 2. Otherwise, if Admin is signed in via Google: show AdminDashboard.
  // 3. Otherwise, if monteurSession is active: show MonteurDashboard.
  // 4. Otherwise: show LoginScreen.
  const showAdminDashboard = isAdmin && !inMonteurPortalMode;
  const showMonteurDashboard = Boolean(monteurSession) && (inMonteurPortalMode || !isAdmin);

  return (
    <ErrorBoundary>
      {!showAdminDashboard && !showMonteurDashboard ? (
        <LoginScreen
          onMonteurSignIn={handleMonteurSignIn}
          onAdminGoogleSignIn={handleAdminGoogleSignIn}
          errorMessage={authError}
          monteurOnlyMode={inMonteurPortalMode}
          onReturnToAdmin={
            isAdmin && adminEnteredMonteurSpace
              ? () => {
                  setAdminEnteredMonteurSpace(false);
                  setAuthError(null);
                }
              : undefined
          }
        />
      ) : (
        <div className="min-h-screen bg-[#F6F6F6] flex flex-col">
          {showAdminDashboard ? (
            <TopBar
              navItems={[
                { id: 'tableau', label: 'Missions' },
                { id: 'nouvelle', label: 'Nouvelle tâche' },
                { id: 'monteurs', label: 'Monteurs & Codes' },
                { id: 'sync', label: 'Export & Sheets' },
              ]}
              activeNavId={adminSection}
              onSelectNav={(id) => setAdminSection(id as AdminSection)}
              actionLabel="Déconnexion"
              onAction={() => void handleSignOutAdmin()}
            />
          ) : (
            <TopBar
              navItems={[
                { id: 'disponibles', label: 'Missions disponibles' },
                { id: 'attribuees', label: 'Mes missions' },
                { id: 'paiements', label: 'Historique des paiements' },
              ]}
              activeNavId={monteurTab}
              onSelectNav={(id) => setMonteurTab(id as MonteurTab)}
              actionLabel={
                isAdmin && adminEnteredMonteurSpace ? 'Retour Admin' : 'Déconnexion'
              }
                onAction={() => {
                  if (isAdmin && adminEnteredMonteurSpace) {
                    setMonteurSession(null);
                    setMonteurDisponible(true);
                    setAdminEnteredMonteurSpace(false);
                    setPublicOpenTasks([]);
                    setInvitedTasks([]);
                    setAssignedMissions([]);
                    setHiddenTaskIds(new Set());
                    setAuthError(null);
                  } else {
                    handleSignOutMonteur();
                  }
                }}
              />
            )}

          <main className="flex-1 pb-12">
            {showAdminDashboard ? (
              <AdminDashboard
                userEmail={adminUser?.email ?? adminEmail}
                activeSection={adminSection}
                onSectionChange={setAdminSection}
                tasks={adminTasks}
                monteurs={adminMonteursWithAvailability}
                loading={dataLoading}
                emailProviderConfigured={emailProviderConfigured}
                gmailConnected={gmailConnected}
                onConnectGmail={async () => {
                  await handleConnectGmail();
                }}
                pendingEmailConfirm={pendingEmailConfirm}
                onConfirmEmailDispatch={handleConfirmPendingEmailSend}
                onDismissEmailConfirm={() => setPendingEmailConfirm(null)}
                onCreateTask={handleCreateTask}
                onUpdateTask={handleUpdateTask}
                onConfirmChefMonteur={handleConfirmChefMonteur}
                onChangeTaskStatus={handleChangeTaskStatus}
                onReopenTask={handleReopenTask}
                onNotifyMonteurs={handleNotifyMonteursForTask}
                onDeleteTask={handleDeleteTask}
                onCreateMonteur={handleCreateMonteur}
                onUpdateMonteurEmail={handleUpdateMonteurEmail}
                onToggleMonteurActive={handleToggleMonteurActive}
                onRegenerateMonteurCode={handleRegenerateMonteurCode}
                onDeleteMonteur={handleDeleteMonteur}
                onSeedDemoTasks={handleSeedDemoTasks}
                onImportCsvTasks={handleImportCsvTasks}
                onPreviewMonteur={() => {
                  setMonteurSession(null);
                  setMonteurDisponible(true);
                  setAuthError(null);
                  setAdminEnteredMonteurSpace(true);
                }}
                onNotify={notify}
              />
            ) : (
              <MonteurDashboard
                session={monteurSession!}
                disponible={monteurDisponible}
                onToggleDisponible={handleToggleMonteurDisponible}
                activeTab={monteurTab}
                onTabChange={setMonteurTab}
                openTasks={openTasks}
                assignedMissions={assignedMissions}
                hiddenTaskIds={hiddenTaskIds}
                loading={dataLoading}
                notifications={monteurNotifications}
                unreadCount={unreadNotificationsCount}
                soundEnabled={soundEnabled}
                onToggleSound={handleToggleSound}
                browserPermission={browserPermission}
                browserNotifEnabled={browserNotifEnabled}
                onEnableBrowserNotifications={handleEnableBrowserNotifications}
                onMarkNotificationRead={handleMarkNotificationRead}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                onClearNotifications={handleClearNotifications}
                onClaimMission={handleClaimMission}
                onStartEditing={handleStartEditing}
                onHideMission={handleHideMission}
                onRestoreHiddenMissions={handleRestoreHiddenMissions}
                onConfirmWhatsAppContact={handleConfirmWhatsAppContact}
                onExpireUnconfirmedClaim={handleExpireUnconfirmedClaim}
              />
            )}
          </main>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ErrorBoundary>
  );
}
