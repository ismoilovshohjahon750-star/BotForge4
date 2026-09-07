/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CallProvider } from './context/CallContext';
import { LanguageProvider } from './context/LanguageContext';
import { Navbar } from './components/Navbar';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Pricing } from './pages/Pricing';
import { Admin } from './pages/Admin';
import { Messages } from './pages/Messages';
import { Auth } from './pages/Auth';
import { ResetPassword } from './pages/ResetPassword';
import { BotlyAi } from './pages/BotlyAi';
import { Docs } from './pages/Docs';
import { Terms } from './pages/Terms';
import { Footer } from './components/Footer';
import { Toaster } from './components/ui/sonner';

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) return <div className="h-screen flex items-center justify-center">Yuklanmoqda...</div>;
  if (!user) return <Navigate to="/auth" />;
  if (adminOnly && !isAdmin) return <Navigate to="/" />;
  
  return <>{children}</>;
};

function AppLayout() {
  const location = useLocation();
  const isMessagesPage = location.pathname === '/messages';

  return (
    <div className={`flex flex-col bg-background font-sans antialiased text-foreground ${isMessagesPage ? 'h-screen w-screen overflow-hidden' : 'min-h-screen'}`}>
      <Navbar />
      <main className={`flex-1 flex flex-col w-full overflow-hidden ${isMessagesPage ? 'h-[calc(100vh-4rem)]' : ''}`}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Terms />} />
          <Route path="/botly-ai" element={<ProtectedRoute><BotlyAi /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        </Routes>
      </main>
      {!isMessagesPage && <Footer />}
      <Toaster position="top-right" duration={3500} richColors />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <CallProvider>
          <Router>
            <AppLayout />
          </Router>
        </CallProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}

