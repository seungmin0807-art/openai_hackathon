const configured = window.MORI_CONFIG?.apiBaseURL?.trim() || '';
const base = configured ? new URL(configured) : new URL(location.origin);
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('API 주소 설정을 확인해 주세요.');
export function apiFetch(route, options = {}) {
  if (!route.startsWith('/api/')) throw new Error('잘못된 API 경로입니다.');
  return fetch(new URL(route, base), { ...options, credentials: base.origin===location.origin?'same-origin':'include' });
}
