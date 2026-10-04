import { AppError } from './errors.js';
export function normalizeReelUrl(input) {
  if (typeof input !== 'string' || input.length > 2048 || /[\\\u0000-\u0020]/.test(input.trim())) throw new AppError('Paste a valid public Instagram Reel URL.');
  let u;
  try { u = new URL(input.trim()); } catch { throw new AppError('Paste a valid public Instagram Reel URL.'); }
  const match = /^\/(reel|reels|p)\/([A-Za-z0-9_-]{5,28})\/?$/.exec(u.pathname);
  if (u.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(u.hostname) || u.username || u.password || u.port || !match) throw new AppError('Use an instagram.com Reel link, or a single video post link.');
  return { url: `https://www.instagram.com/reel/${match[2]}/`, shortcode: match[2] };
}
export function isInstagramCdn(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['cdninstagram.com', 'fbcdn.net'].some(d => u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}
