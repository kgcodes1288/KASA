import axios from 'axios';

// Normalise VITE_API_URL: strip any trailing /api then re-append it,
// so both "https://host.com" and "https://host.com/api" work correctly.
const _raw = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const API_BASE_URL = _raw ? `${_raw}/api` : '/api';

// The browser session is an HttpOnly cookie (set by the server). The custom header proves a request came from this app (CSRF protection).
const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, headers: { 'X-CleanStay-CSRF': '1' } });

api.interceptors.request.use((config) => {
  // older sessions (signed in before the cookie change) keep working until they sign in again
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const isAuthRoute = err.config?.url?.includes('/auth/');
    if (err.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;