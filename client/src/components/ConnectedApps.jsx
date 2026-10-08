import { useEffect, useState } from 'react';
import api from '../api';

const TOOL_LABEL = (t) => t.replace(/_/g, ' ');

// Account tab: connect CleanStay to chat assistants (Claude, ChatGPT, Gemini) via MCP.
export default function ConnectedApps() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = () => api.get('/mcp/connections').then((r) => setData(r.data)).catch(() => setData({ connections: [], recent: [], connectorUrl: null }));
  useEffect(() => { load(); }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(data.connectorUrl);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const disconnect = async (c) => {
    if (!window.confirm(`Disconnect ${c.name}? It will no longer be able to see or change your CleanStay data.`)) return;
    setBusy(c.clientId);
    try { await api.delete(`/mcp/connections/${c.clientId}`); await load(); } finally { setBusy(null); }
  };

  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>;

  return (
    <section className="account-section">
      <h2>🤖 Chat assistants</h2>
      <p style={{ fontSize: 14 }}>
        Manage your properties by chatting — ask what needs attention, add tasks and vendors, send or approve quotes — from Claude, ChatGPT or Gemini.
      </p>

      {data.connectorUrl ? (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, margin: '14px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Your CleanStay connector URL</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 220, padding: '8px 10px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, wordBreak: 'break-all' }}>{data.connectorUrl}</code>
            <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
          <ol style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '12px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            <li><strong>Claude:</strong> Settings → Connectors → Add custom connector → paste the URL.</li>
            <li><strong>ChatGPT:</strong> Settings → Apps → Advanced → Developer mode on, then create a connector with the URL (paid plans).</li>
            <li><strong>Gemini:</strong> Settings → Connected apps → Add a custom app → paste the URL.</li>
            <li>Sign in with your CleanStay email and password when asked, then choose what to allow.</li>
          </ol>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>The chat connector isn't switched on for this environment yet.</p>
      )}

      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Connected apps</h3>
      {data.connections.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-ghost)' }}>Nothing connected yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.connections.map((c) => (
            <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-ghost)' }}>
                  {c.scopes.includes('write') ? 'Can view and make changes' : 'View only'} · connected {new Date(c.connectedAt).toLocaleDateString()}
                  {c.lastUsedAt ? ` · last used ${new Date(c.lastUsedAt).toLocaleString()}` : ''}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" disabled={busy === c.clientId} onClick={() => disconnect(c)}>
                {busy === c.clientId ? '…' : 'Disconnect'}
              </button>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Recent assistant activity</h3>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.recent.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 8, color: 'var(--ink-soft)' }}>
                <span aria-hidden="true">{!a.ok ? '⚠️' : a.isWrite ? '✏️' : '👁'}</span>
                <span style={{ flex: 1 }}>{TOOL_LABEL(a.tool)}{!a.ok ? ' (failed)' : ''}</span>
                <span style={{ color: 'var(--ink-ghost)' }}>{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
