// Remember where to send the user after they sign in (survives the Google redirect round-trip).
const KEY = 'postLoginRedirect';

export const rememberPostLoginRedirect = (path) => sessionStorage.setItem(KEY, path);

// Only same-site paths are honoured, so this can't be used as an open redirect.
export function consumePostLoginRedirect() {
  const path = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
}
