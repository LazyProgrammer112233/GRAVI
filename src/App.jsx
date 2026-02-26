import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import AnalysisDashboard from './pages/AnalysisDashboard';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import BulkAnalysisDashboard from './pages/BulkAnalysisDashboard';
import { LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';
import logoImg from './assets/logo11.png';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

  if (!session) {
    return <Navigate to="/login" />;
  }

  return children;
};

// App Layout Wrapper for internal pages
const AppLayout = ({ children }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="app-container">
      <header className="app-header glass-header">
        <div
          onClick={() => navigate('/app')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        >
          <img src={logoImg} alt="GRAVI Logo" style={{ height: '36px', objectFit: 'contain', borderRadius: '8px' }} />
          <h1 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>GRAVI</h1>
        </div>
        <button className="btn btn-glass btn-sm" onClick={handleLogout}>
          <LogOut size={16} style={{ marginRight: '0.5rem' }} /> Logout
        </button>
      </header>
      <main className="main-content fade-in">
        {children}
      </main>
    </div>
  );
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout><UploadPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/analysis/:id"
        element={
          <ProtectedRoute>
            <AppLayout><AnalysisDashboard /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/bulk-analysis/:id"
        element={
          <ProtectedRoute>
            <AppLayout><BulkAnalysisDashboard /></AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
