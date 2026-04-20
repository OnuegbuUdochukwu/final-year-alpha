/**
 * client.ts — Centralised Axios instance for the AI Career Pathfinder.
 *
 * All API calls go through the API Gateway (port 8080).
 * The request interceptor automatically attaches the JWT stored in
 * localStorage so every component stays clean of auth boilerplate.
 */

import axios from 'axios';

// The API Gateway is the single entry-point for all service calls.
// In Docker Compose the frontend talks to localhost:8080.
const GATEWAY_BASE_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8080';

const client = axios.create({
  baseURL: GATEWAY_BASE_URL,
  timeout: 60_000, // 60 s — NLP parsing can be slow
});

// ─── Request interceptor ──────────────────────────────────────────────────────
// Attach the Bearer token on every outgoing request (if one exists).
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor ─────────────────────────────────────────────────────
// If the server returns 401 the token has expired — clear it so the
// LoginModal will re-appear on the next render cycle.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      // Dispatch a custom event so AuthContext can react without a hard refresh.
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  }
);

export default client;
