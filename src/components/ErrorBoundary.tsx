import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Une erreur inattendue est survenue.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      let friendlyMessage = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && typeof parsed.error === 'string') {
          friendlyMessage = parsed.error.includes('Missing or insufficient permissions')
            ? "Accès refusé par les règles de sécurité Firestore. Vérifiez que votre adresse email Google est vérifiée et autorisée pour cette opération."
            : parsed.error;
        }
      } catch {
        // Not JSON, keep message
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">
              Erreur de chargement du portail
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {friendlyMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a73e8] text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              Recharger l&apos;application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
