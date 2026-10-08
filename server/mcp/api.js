const jwt = require('jsonwebtoken');

const API_BASE = () => process.env.API_INTERNAL_URL || 'http://localhost:5000';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Calls the existing REST API as the connected user, so all existing permission
// rules (owner vs co-host, hidden drafts, …) apply unchanged.
async function callApi(userId, method, path, body) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '2m' });
  const res = await fetch(`${API_BASE()}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, (data && (data.message || data.error)) || `Request failed (${res.status})`);
  return data;
}

module.exports = { callApi, ApiError };
