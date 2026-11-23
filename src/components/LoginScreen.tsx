import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Film, KeyRound, Phone } from 'lucide-react';
import { TopBar } from './TopBar';

interface LoginScreenProps {
  onMonteurSignIn: (phone: string, accessCode: string) => Promise<void>;
  onAdminGoogleSignIn: () => Promise<void>;
  errorMessage: string | null;
  monteurOnlyMode?: boolean;
  onReturnToAdmin?: () => void;
}

export function LoginScreen({
  onMonteurSignIn,
  onAdminGoogleSignIn,
  errorMessage,
  monteurOnlyMode = false,
  onReturnToAdmin,
}: LoginScreenProps) {
  const [phone, setPhone] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [monteurLoading, setMonteurLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleMonteurSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !accessCode.trim()) return;
    setMonteurLoading(true);
    try {
      await onMonteurSignIn(phone, accessCode);
    } finally {
      setMonteurLoading(false);
    }
  };

  const handleAdminClick = async () => {
    setAdminLoading(true);
    try {
      await onAdminGoogleSignIn();
    } finally {
      setAdminLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F6F6]">
      <TopBar
        navItems={[
          { id: 'acces-monteur', label: 'Identification' },
          { id: 'workflow', label: 'Fonctionnement' },
          { id: 'remuneration', label: 'Paiements DZD' },
        ]}
        onSelectNav={scrollToSection}
        actionLabel={onReturnToAdmin ? 'Retour Admin' : undefined}
        onAction={onReturnToAdmin}
        actionDisabled={adminLoading}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* Left Column: Monteur Phone + Access Code Entry */}
          <div
            id="acces-monteur"
            className="lg:col-span-6 flex flex-col justify-between bg-white border border-neutral-200 rounded-2xl p-8 sm:p-10"
          >
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#9A3412] mb-2">
                Espace Monteur Vidéo
              </p>
              <h1
                className="font-display text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight leading-[1.12] mb-3"
                style={{ textWrap: 'balance' }}
              >
                Identifiez-vous pour accéder à vos missions.
              </h1>
              <p className="text-sm sm:text-base text-neutral-600 leading-relaxed mb-7">
                Entrez votre numéro de téléphone et le code d&apos;accès qui vous a été fourni.
                Vous pourrez ensuite accepter les missions disponibles en un clic, sans validation
                préalable.
              </p>

              <form onSubmit={(e) => void handleMonteurSubmit(e)} className="space-y-4">
                <div>
                  <label
                    htmlFor="monteur-phone"
                    className="block text-xs font-semibold text-neutral-800 mb-1.5"
                  >
                    Numéro de téléphone
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="monteur-phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ex : 0550 12 34 56"
                      className="w-full pl-10 pr-4 py-3 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#9A3412] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="monteur-code"
                    className="block text-xs font-semibold text-neutral-800 mb-1.5"
                  >
                    Code d&apos;accès
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="monteur-code"
                      type={showCode ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      placeholder="Saisissez votre code d'accès"
                      className="w-full pl-10 pr-11 py-3 text-sm font-mono bg-[#F6F6F6] border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#9A3412] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode((v) => !v)}
                      aria-label={showCode ? 'Masquer le code' : 'Afficher le code'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-[#9A3412] cursor-pointer"
                    >
                      {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={monteurLoading || !phone.trim() || !accessCode.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg bg-[#9A3412] text-white text-sm font-semibold hover:bg-[#7C2D12] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{monteurLoading ? 'Vérification...' : 'Se connecter'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {!monteurOnlyMode && !onReturnToAdmin && (
              <div className="mt-8 pt-6 border-t border-neutral-200 flex items-center justify-between gap-4">
                <span className="text-xs text-neutral-500">
                  Gestionnaire du portail ?
                </span>
                <button
                  type="button"
                  onClick={() => void handleAdminClick()}
                  disabled={adminLoading}
                  className="text-xs font-semibold text-neutral-900 underline underline-offset-4 hover:text-[#9A3412] cursor-pointer disabled:opacity-50"
                >
                  {adminLoading ? 'Connexion...' : 'Connexion Administrateur (Google)'}
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Studio Visual */}
          <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-neutral-200 bg-[#7C2D12] min-h-[320px] flex">
            {!imgFailed ? (
              <img
                src="/src/assets/images/studio_editing_suite_1795380815937.jpg"
                alt="Poste de montage vidéo et d'étalonnage en studio"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-10 bg-[#9A3412] text-white">
                <Film className="w-12 h-12 text-white mb-3" />
                <p className="font-display font-semibold">Studio de Montage Vidéo</p>
                <p className="text-sm text-orange-100 mt-1">
                  Portail de missions &amp; suivi DZD
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Structured Info Strip */}
        <section id="workflow" className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <p className="font-mono text-xs font-semibold text-[#9A3412] mb-2">
              01. Identification rapide
            </p>
            <h2 className="font-display text-base font-bold text-neutral-900 mb-1.5">
              Téléphone + Code d&apos;accès
            </h2>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Aucun compte Google requis pour les monteurs : utilisez simplement votre numéro de
              téléphone et le code remis par l&apos;équipe.
            </p>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <p className="font-mono text-xs font-semibold text-[#276EF1] mb-2">
              02. Attribution instantanée
            </p>
            <h2 className="font-display text-base font-bold text-neutral-900 mb-1.5">
              Acceptez et démarrez tout de suite
            </h2>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Première acceptation, mission attribuée : cliquez sur « Accepter la mission » pour
              débloquer immédiatement les rushs Google Drive.
            </p>
          </div>

          <div id="remuneration" className="bg-white border border-neutral-200 rounded-xl p-6">
            <p className="font-mono text-xs font-semibold text-[#05944F] mb-2">
              03. Suivi des gains DZD
            </p>
            <h2 className="font-display text-base font-bold text-neutral-900 mb-1.5">
              Compteur en temps réel
            </h2>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Chaque livraison validée « Done » crédite instantanément votre total en Dinars
              Algériens sur votre tableau de bord.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
