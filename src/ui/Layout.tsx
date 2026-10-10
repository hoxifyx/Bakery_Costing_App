import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { compute } from '../engine';

const UI_DB_NAME = 'bakery-ui-state';
const UI_STORE_NAME = 'ui';

function openUIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(UI_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(UI_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveCollapsedSections(sections: string[]) {
  openUIDB().then(db => {
    const tx = db.transaction(UI_STORE_NAME, 'readwrite');
    tx.objectStore(UI_STORE_NAME).put(sections, 'collapsed-sections');
  }).catch(console.error);
}

function loadCollapsedSections(): Promise<string[]> {
  return openUIDB().then(db => new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(UI_STORE_NAME, 'readonly');
    const req = tx.objectStore(UI_STORE_NAME).get('collapsed-sections');
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  })).catch(() => []);
}

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

export function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const { state } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [timeAgoText, setTimeAgoText] = useState('Just now');
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    loadCollapsedSections().then(setCollapsedSections);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      setTimeout(() => {
        const firstNav = document.querySelector('.sidebar nav button') as HTMLButtonElement | null;
        if (firstNav) firstNav.focus();
      }, 50);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setMobileMenuOpen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    } else {
      menuBtnRef.current?.focus();
    }
  }, [mobileMenuOpen]);

  const toggleSection = (title: string) => {
    setCollapsedSections(prev => {
      const next = prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title];
      saveCollapsedSections(next);
      return next;
    });
  };

  // Compute warning count for the global nav badge
  const warningCount = useMemo(() => {
    try {
      const res = compute(state.data);
      return res.all_warnings.length;
    } catch {
      return 0;
    }
  }, [state.data]);

  // Update time-ago text for autosave
  useEffect(() => {
    const update = () => {
      if (!state.lastSaved) {
        setTimeAgoText('Not saved yet');
        return;
      }
      const diffMs = Date.now() - state.lastSaved.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 5) setTimeAgoText('Just now');
      else if (diffSec < 60) setTimeAgoText(`${diffSec}s ago`);
      else {
        const diffMin = Math.floor(diffSec / 60);
        setTimeAgoText(`${diffMin}m ago`);
      }
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [state.lastSaved]);

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    badge?: number;
    badgeDanger?: boolean;
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  const navSections: NavSection[] = [
    {
      title: 'Quote',
      items: [
        { id: 'quote', label: 'Quote', icon: '🎂' },
        { id: 'saved_quotes', label: 'Saved Quotes', icon: '📑', badge: state.data.saved_quotes.length > 0 ? state.data.saved_quotes.length : undefined },
      ],
    },
    {
      title: 'Catalog',
      items: [
        { id: 'ingredients', label: 'Ingredients', icon: '🧂' },
        { id: 'packaging', label: 'Packaging', icon: '📦' },
        { id: 'recipes', label: 'Recipes', icon: '📋' },
        { id: 'flavours', label: 'Flavours & Fillings', icon: '🍓' },
        { id: 'products', label: 'Products', icon: '🍩' },
      ],
    },
    {
      title: 'Records',
      items: [
        { id: 'orders', label: 'Orders', icon: '🛍️' },
        { id: 'customers', label: 'Customers', icon: '👥' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { id: 'settings', label: 'Settings', icon: '⚙️' },
        { id: 'health', label: 'Data Health', icon: '🏥', badge: warningCount, badgeDanger: warningCount > 0 },
        { id: 'import_export', label: 'Import / Export', icon: '📤' },
      ],
    },
  ];

  const handleNavClick = (id: string) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  const currencyCode = state.data.settings.currency_code || 'USD';

  return (
    <div className="app-shell">
      {/* Mobile top bar */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <span className="mobile-header-logo">🎂</span>
          <span className="mobile-header-title">OvenCost Pro</span>
        </div>
        <button
          ref={menuBtnRef}
          className="btn btn-secondary"
          style={{ padding: '6px 10px', fontSize: 16 }}
          onClick={() => setMobileMenuOpen(prev => !prev)}
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-inner">
          {/* Logo / Brand */}
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">🎂</div>
            <div className="sidebar-logo-text-wrap">
              <span className="sidebar-logo-text">OvenCost Pro</span>
              <span className="sidebar-logo-sub">Costing Engine</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            {navSections.map(sec => {
              const isCollapsed = collapsedSections.includes(sec.title);
              return (
                <div key={sec.title} className="nav-section">
                  <button
                    type="button"
                    className="nav-section-label"
                    onClick={() => toggleSection(sec.title)}
                    aria-expanded={!isCollapsed}
                  >
                    <span>{sec.title}</span>
                    <span className={`nav-section-caret ${!isCollapsed ? 'open' : ''}`}>▼</span>
                  </button>
                  {!isCollapsed && (
                    <div className="nav-section-items">
                      {sec.items.map(item => {
                        const active = currentPage === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`nav-item ${active ? 'active' : ''}`}
                            onClick={() => handleNavClick(item.id)}
                          >
                            <span className="nav-item-icon">{item.icon}</span>
                            <span className="nav-item-label">{item.label}</span>
                            {item.badge !== undefined && item.badge > 0 && (
                              <span className={`nav-badge ${item.badgeDanger ? 'nav-badge-danger' : ''}`}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="save-pill">
            <span className={`save-dot ${state.saving ? 'saving' : ''}`} />
            <span className="save-pill-text">
              {state.saving ? 'Saving…' : `Saved: ${timeAgoText}`}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="app-header">
          <div className="app-header-left">
            <div className="app-header-context">
              <span>Main Production Lab</span>
            </div>
          </div>
          <div className="app-header-right">
            <div className="app-header-chip">
              <span className="app-header-chip-accent">{currencyCode}</span>
              <span className="app-header-chip-sep">/</span>
              <span>Active</span>
            </div>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
