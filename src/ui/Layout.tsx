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

  const navSections = [
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
        { id: 'health', label: 'Data Health', icon: '🏥', badge: warningCount },
        { id: 'import_export', label: 'Import / Export', icon: '📤' },
      ],
    },
  ];

  const handleNavClick = (id: string) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-container" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Mobile Header Bar */}
      <div
        className="mobile-header"
        style={{
          display: 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          zIndex: 100,
          padding: '0 16px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎂</span>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>OvenCost Pro</span>
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
      </div>

      {/* Sidebar Overlay for Mobile */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 90,
          }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${mobileMenuOpen ? 'sidebar-mobile-open' : ''}`}
        style={{
          width: 250,
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 95,
          userSelect: 'none',
        }}
      >
        {/* Brand */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                boxShadow: '0 4px 12px rgba(167, 139, 250, 0.25)',
              }}
            >
              🎂
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                OvenCost Pro
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Costing &amp; Pricing Engine</div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {navSections.map(sec => {
              const isCollapsed = collapsedSections.includes(sec.title);
              return (
                <div key={sec.title} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => toggleSection(sec.title)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      padding: '6px 12px 4px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span>{sec.title}</span>
                    <span style={{ fontSize: 8, opacity: 0.5 }}>{isCollapsed ? '▼' : '▲'}</span>
                  </div>
                  {!isCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {sec.items.map(item => {
                        const active = currentPage === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: active ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                              color: active ? 'var(--accent)' : 'var(--text-secondary)',
                              fontWeight: active ? 600 : 400,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'all 120ms ease-out',
                              textAlign: 'left',
                            }}
                            onMouseEnter={e => {
                              if (!active) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!active) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                              }
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 14 }}>{item.icon}</span>
                              <span>{item.label}</span>
                            </div>

                            {item.badge !== undefined && item.badge > 0 && (
                              <span
                                className="badge badge-accent"
                                style={{
                                  padding: '1px 7px',
                                  fontSize: 11,
                                  borderRadius: 12,
                                }}
                              >
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
          </div>
        </nav>

        {/* Footer: Autosave Status */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: state.saving ? 'var(--accent-amber)' : 'var(--accent-green)',
                boxShadow: `0 0 6px ${state.saving ? 'var(--accent-amber)' : 'var(--accent-green)'}`,
                display: 'inline-block',
              }}
            />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {state.saving ? 'Saving...' : 'IndexedDB Autosave'}
            </span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {state.saving ? 'Writing changes...' : `Saved: ${timeAgoText}`}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '28px 32px',
          overflowY: 'auto',
          maxWidth: 1240,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {children}
      </main>
    </div>
  );
}
