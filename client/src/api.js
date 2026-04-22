import axios from 'axios';

// Normalise VITE_API_URL: strip any trailing /api then re-append it,
// so both "https://host.com" and "https://host.com/api" work correctly.
const _raw = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const API_BASE_URL = _raw ? `${_raw}/api` : '/api';

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
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