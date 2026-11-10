const configuredApiOrigin = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

export const apiOrigin = configuredApiOrigin;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/api/') || path === '/api'
    ? path
    : '/api' + (path.startsWith('/') ? path : '/' + path);
  return configuredApiOrigin + normalizedPath;
}
