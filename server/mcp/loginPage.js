// Server-rendered sign-in + consent page shown when a chat app (Claude, ChatGPT, Gemini…)
// asks to connect to a CleanStay account.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderLoginPage({ reqToken, clientName, wantsWrite, error, email = '', clientUrl }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to CleanStay</title>
<style>
  :root{--ink:#0f0e0c;--soft:#5a5750;--teal:#00897b;--border:#e4e0d8;--bg:#f7f5f0}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,14,12,.12);padding:28px;max-width:420px;width:100%}
  h1{font-size:22px;margin:0 0 4px} p{color:var(--soft);font-size:14px;line-height:1.5;margin:8px 0}
  label{display:block;font-size:13px;font-weight:600;margin:14px 0 4px}
  input[type=email],input[type=password]{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:15px}
  .perm{background:var(--bg);border-radius:10px;padding:10px 12px;margin-top:16px;font-size:13px;color:var(--soft)}
  .perm label{font-weight:400;display:flex;gap:8px;align-items:flex-start;margin:6px 0 0;color:var(--ink)}
  .row{display:flex;gap:10px;margin-top:20px} button{flex:1;padding:11px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:#fff}
  button.primary{background:var(--teal);color:#fff;border-color:var(--teal)} .err{background:#fee2e2;color:#991b1b;border-radius:8px;padding:8px 12px;font-size:13px;margin-top:12px}
  a{color:var(--teal);font-size:13px}
</style></head>
<body><form class="card" method="post" action="/oauth/consent">
  <h1>🧹 CleanStay</h1>
  <p><strong>${esc(clientName)}</strong> wants to connect to your CleanStay account so you can manage your properties from chat.</p>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <input type="hidden" name="req" value="${esc(reqToken)}">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <p><a href="${esc(clientUrl)}/forgot-password" target="_blank" rel="noreferrer">Forgot password / signed up with Google? Set a password here.</a></p>
  <div class="perm">
    <strong>This app will be able to:</strong>
    <div style="margin-top:4px">• View your properties, bookings, jobs, tasks, quotes and vendors</div>
    ${wantsWrite ? `<label><input type="checkbox" name="allow_write" checked> <span>Make changes for you — create tasks, assign cleaners, send quotes and invoices, approve or decline quotes. You'll be asked to confirm anything involving money or messages.</span></label>` : ''}
  </div>
  <p style="font-size:12px">You can disconnect any time from your CleanStay account.</p>
  <div class="row"><button type="submit" name="action" value="deny">Cancel</button><button class="primary" type="submit" name="action" value="allow">Allow</button></div>
</form></body></html>`;
}

module.exports = { renderLoginPage };
