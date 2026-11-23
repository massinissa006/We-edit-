export interface TopBarNavItem {
  id: string;
  label: string;
}

interface TopBarProps {
  navItems: TopBarNavItem[];
  activeNavId?: string;
  onSelectNav?: (id: string) => void;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export function TopBar({
  navItems,
  activeNavId,
  onSelectNav,
  actionLabel,
  onAction,
  actionDisabled = false,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#9A3412] text-white border-b border-[#7C2D12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Portail Monteurs Vidéo
        </span>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Navigation principale"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNav?.(item.id)}
                className={`py-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  isActive
                    ? 'text-white border-white font-semibold'
                    : 'text-orange-100/85 border-transparent hover:text-white hover:border-orange-200/70'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Optional primary action button */}
        <div className="flex items-center shrink-0">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="px-4 py-2 text-sm font-semibold rounded-full bg-white text-[#9A3412] hover:bg-orange-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
