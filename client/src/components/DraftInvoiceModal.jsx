import { useState } from 'react';
import api from '../api';

// Edit a draft invoice (created automatically when the owner approves a quote).
export default function DraftInvoiceModal({ task, onClose, onSaved }) {
  const [title, setTitle] = useState(task.title);
  const [amount, setAmount] = useState(String(task.paymentAmount ?? '').replace(/^\$/, ''));
  const [notes, setNotes] = useState(task.notes || '');
  const [due, setDue] = useState(new Date(task.nextDueAt).toISOString().slice(0, 10));
  const [files, setFiles] = useState(task.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addFiles = async (e) => {
    const picked = Array.from(e.target.files);
    e.target.value = '';
    setUploading(true); setError('');
    try {
      for (const file of picked) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setFiles((f) => [...f, res.data.url]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!(parseFloat(amount) > 0)) { setError('Enter the invoice amount'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/maintenance/${task.id}/draft`, { title, notes, paymentAmount: amount, nextDueAt: due, attachments: files });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>Edit draft invoice</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-group">
          <label>Invoice for</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Amount ($)</label>
          <input className="input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p style={{ fontSize: 12, marginTop: 4 }}>Starts at the approved quote. Change it if the final cost differs.</p>
        </div>
        <div className="form-group">
          <label>Details <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(optional)</span></label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <div className="form-group">
          <label>Payment due by</label>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Attachments <span style={{ fontWeight: 400, color: 'var(--ink-ghost)' }}>(receipt, vendor invoice, photos)</span></label>
          {files.map((url, i) => (
            <div key={url} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 9px', marginBottom: 5, borderRadius: 7, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <a href={url} target="_blank" rel="noreferrer">📎 File {i + 1}</a>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setFiles((f) => f.filter((x) => x !== url))}>×</button>
            </div>
          ))}
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            {uploading ? 'Uploading…' : '📎 Add files'}
            <input type="file" multiple accept="image/*,application/pdf" onChange={addFiles} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save draft'}</button>
        </div>
      </div>
    </div>
  );
}
