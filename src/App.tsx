import { useState } from 'react';
import { StoreProvider, useStore } from './store/store';
import { Layout } from './ui/Layout';
import { QuotePage } from './ui/pages/QuotePage';
import { ProductQuotePage } from './ui/pages/ProductQuotePage';
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

function AppContent() {
  const { state } = useStore();
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

  const renderPage = () => {
    switch (currentPage) {
      case 'quote':
        return <QuotePage />;
      case 'product_quote':
        return <ProductQuotePage />;
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
      {renderPage()}
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
