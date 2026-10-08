import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { rememberPostLoginRedirect } from '../postLoginRedirect';

// "Allow <chat app> to access your CleanStay account?" — the consent step of the MCP connector flow.
export default function Connect() {
  const { user, loading, logout } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const req = params.get('req');

  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [allowWrite, setAllowWrite] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      rememberPostLoginRedirect(location.pathname + location.search);
      navigate('/login', { replace: true });
      return;
    }
    if (!req) { setError('This page is opened from your chat app. Add the CleanStay connector there to get started.'); return; }
    api.get('/mcp/authorize-info', { params: { req } })
      .then((r) => setInfo(r.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load this connection request.'));
  }, [loading, user]);

  const decide = async (action) => {
    setBusy(true);
    try {
      const { data } = await api.post('/mcp/authorize', { req, action, allowWrite: info.wantsWrite && allowWrite });
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  const switchAccount = () => {
    rememberPostLoginRedirect(location.pathname + location.search);
    logout();
    navigate('/login', { replace: true });
  };

  const shell = (children) => (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-lg)', padding: 28, maxWidth: 440, width: '100%' }}>{children}</div>
    </div>
  );

  if (loading || (!error && !info)) return shell(<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>);

  if (error) return shell(
    <>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <p style={{ color: '#991b1b', margin: '10px 0 16px' }}>{error}</p>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>Go to CleanStay</button>
    </>
  );

  if (user.role !== 'host') return shell(
    <>
      <div style={{ fontSize: 32 }}>🧹</div>
      <p style={{ margin: '10px 0 16px' }}>Chat assistants are available for host and co-host accounts. You're signed in as a cleaner account.</p>
      <button className="btn btn-secondary" onClick={switchAccount}>Sign in with a different account</button>
    </>
  );

  return shell(
    <>
      <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>🧹 Connect {info.clientName}</h1>
      <p style={{ fontSize: 14, margin: '0 0 14px' }}>
        <strong>{info.clientName}</strong> wants to access your CleanStay account so you can manage your properties by chatting.
      </p>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
        Signed in as <strong>{user.name}</strong> ({user.email}){' '}
        <button onClick={switchAccount} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', padding: 0, fontSize: 13 }}>Not you?</button>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        <strong style={{ color: 'var(--ink)' }}>This app will be able to:</strong>
        <div style={{ marginTop: 4 }}>• View your properties, bookings, jobs, tasks, quotes and vendors</div>
        {info.wantsWrite && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, color: 'var(--ink)' }}>
            <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Make changes for you — create tasks, assign cleaners, send quotes and invoices, approve or decline quotes. Anything involving money or messages needs your explicit confirmation.</span>
          </label>
        )}
      </div>
      {!info.knownApp && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 12px', fontSize: 13, margin: '0 0 14px' }}>
          ⚠️ This isn't one of the usual chat apps (Claude, ChatGPT, Gemini). Only continue if <strong>you</strong> just started this connection yourself — never because of a link someone sent you.
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--ink-ghost)', margin: '0 0 16px' }}>
        You'll be sent back to <strong>{info.redirectHost}</strong>. You can disconnect any time under Account → Chat assistants.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => decide('deny')}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => decide('allow')}>{busy ? '…' : 'Allow'}</button>
      </div>
    </>
  );
}
