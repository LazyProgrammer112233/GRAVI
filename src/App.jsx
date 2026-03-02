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
  const [session, setSession] = useState(undefined); // undefined means "resolving"
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    let active = true;

    const resolveSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) throw error;
        setSession(data.session);
      } catch (err) {
        if (!active) return;
        // Supabase threw a network error (like "Failed to fetch"). 
        // We will attempt to fall back to the localStorage cached session.
        const cachedStr = localStorage.getItem('gravi-supabase-auth');
        if (cachedStr) {
          try {
            const cached = JSON.parse(cachedStr);
            // Different SDK versions scope the session under different keys
            const rawSession = cached?.currentSession || cached?.session || cached;
            if (rawSession && rawSession.access_token) {
              setSession(rawSession);
              setIsOfflineMode(true);
              return;
            }
          } catch { /* ignore cache parse errors */ }
        }
        // If there's no cache, we legitimately cannot log them in
        setSession(null);
      }
    };

    resolveSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>Connecting to Supabase...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {isOfflineMode && (
        <div style={{ background: 'rgba(251,191,36,0.15)', borderBottom: '1px solid rgba(251,191,36,0.3)', padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#fbbf24', textAlign: 'center', fontWeight: 600 }}>
          ⚠ Network issues detected — running on cached login session.
        </div>
      )}
      {children}
    </>
  );
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
