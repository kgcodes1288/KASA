import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import HostDashboard from './pages/HostDashboard';
import CleanerDashboard from './pages/CleanerDashboard';
import ListingDetail from './pages/ListingDetail';
import JobDetail from './pages/JobDetail';
import AccountPage from './pages/AccountPage';

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/" element={<PrivateRoute><RoleRedirect /></PrivateRoute>} />

          <Route path="/host" element={
            <PrivateRoute role="host">
              <Layout><HostDashboard /></Layout>
            </PrivateRoute>
          } />

          <Route path="/listings/:id" element={
            <PrivateRoute role="host">
              <Layout><ListingDetail /></Layout>
            </PrivateRoute>
          } />

          <Route path="/cleaner" element={
            <PrivateRoute role="cleaner">
              <Layout><CleanerDashboard /></Layout>
            </PrivateRoute>
          } />

          <Route path="/jobs/:id" element={
            <PrivateRoute>
              <Layout><JobDetail /></Layout>
            </PrivateRoute>
          } />
          <Route path="/account" element={
          <PrivateRoute>
          <Layout><AccountPage /></Layout>
          </PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
