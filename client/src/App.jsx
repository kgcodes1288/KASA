import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import HostDashboard from './pages/HostDashboard';
import CleanerDashboard from './pages/CleanerDashboard';
import ListingDetail from './pages/ListingDetail';
import JobDetail from './pages/JobDetail';
import AccountPage from './pages/AccountPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import ContractorJob from './pages/ContractorJob';
import ContractorMaintenance from './pages/ContractorMaintenance';
import LegalPage from './pages/LegalPage';
import ComplianceTerms from './pages/ComplianceTerms';
import NotificationsPage from './pages/NotificationsPage';
import AuthCallback from './pages/AuthCallback';

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding: 80 }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding: 80 }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'host' ? '/host' : '/cleaner'} replace />;
}

function Layout({ children }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/job/:token" element={<ContractorJob />} />
          <Route path="/maintenance/:token" element={<ContractorMaintenance />} />
          <Route path="/compliance-terms" element={<ComplianceTerms />} />
          <Route path="/" element={<PrivateRoute><RoleRedirect /></PrivateRoute>} />
          <Route path="/host" element={
            <PrivateRoute role="host"><Layout><HostDashboard /></Layout></PrivateRoute>
          } />
          <Route path="/listings/:id" element={
            <PrivateRoute role="host"><Layout><ListingDetail /></Layout></PrivateRoute>
          } />
          <Route path="/cleaner" element={
            <PrivateRoute role="cleaner"><Layout><CleanerDashboard /></Layout></PrivateRoute>
          } />
          <Route path="/jobs/:id" element={
            <PrivateRoute><Layout><JobDetail /></Layout></PrivateRoute>
          } />
          <Route path="/account" element={
            <PrivateRoute><Layout><AccountPage /></Layout></PrivateRoute>
          } />
          <Route path="/notifications" element={
            <PrivateRoute><Layout><NotificationsPage /></Layout></PrivateRoute>
          } />
          <Route path="/accept-invite/:token" element={
            <Layout><AcceptInvitePage /></Layout>
          } />
          <Route path="/privacy-terms" element={<LegalPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}