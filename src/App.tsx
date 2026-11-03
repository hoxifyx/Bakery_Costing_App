import { useState } from 'react';
import { StoreProvider, useStore } from './store/store';
import { Layout } from './ui/Layout';
import { QuotePage } from './ui/pages/QuotePage';
import { ProductQuotePage } from './ui/pages/ProductQuotePage';
import { WhatIfPage } from './ui/pages/WhatIfPage';
import { IngredientsPage } from './ui/pages/IngredientsPage';
import { PackagingPage } from './ui/pages/PackagingPage';
import { RecipesPage } from './ui/pages/RecipesPage';
import { FlavoursPage } from './ui/pages/FlavoursPage';
import { ProductsPage } from './ui/pages/ProductsPage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { DataHealthPage } from './ui/pages/DataHealthPage';
import { ImportExportPage } from './ui/pages/ImportExportPage';
import { SavedQuotesPage } from './ui/pages/SavedQuotesPage';
import { CustomersPage } from './ui/pages/CustomersPage';
import { OrdersPage } from './ui/pages/OrdersPage';
import { PageErrorBoundary } from './ui/components/PageErrorBoundary';

function AppContent() {
  const { state, retryLoad } = useStore();
  const [currentPage, setCurrentPage] = useState('quote');

  if (state.loading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        color: 'var(--text-secondary)',
        flexDirection: 'column',
        gap: 16
      }}>
        <div style={{ fontSize: 40, animation: 'spin 1s linear infinite' }}>🎂</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Loading OvenCost Pro database...</div>
      </div>
    );
  }

  if (state.loadError && currentPage !== 'import_export') {
    return (
      <main
        role="alert"
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h1>Unable to load saved data</h1>
        <p>{state.loadError}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={retryLoad}>
            Retry
          </button>
          <button type="button" className="quote-toolbar-btn" onClick={() => setCurrentPage('import_export')}>
            Import / Export
          </button>
        </div>
      </main>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'quote':
        return <QuotePage />;
      case 'product_quote':
        return <ProductQuotePage />;
      case 'what_if':
        return <WhatIfPage />;
      case 'saved_quotes':
        return <SavedQuotesPage onNavigate={setCurrentPage} />;
      case 'customers':
        return <CustomersPage />;
      case 'orders':
        return <OrdersPage onNavigate={setCurrentPage} />;
      case 'ingredients':
        return <IngredientsPage />;
      case 'packaging':
        return <PackagingPage />;
      case 'recipes':
        return <RecipesPage />;
      case 'flavours':
        return <FlavoursPage />;
      case 'products':
        return <ProductsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'health':
        return <DataHealthPage onNavigate={setCurrentPage} />;
      case 'import_export':
        return <ImportExportPage />;
      default:
        return <QuotePage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      <PageErrorBoundary key={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </PageErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
