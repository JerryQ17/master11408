import { createAuthClient } from 'better-auth/vue';
import { passkeyClient } from '@better-auth/passkey/client';

// Keep invitation tokens in POST bodies, including when using the official client.
const authFetch: typeof fetch = (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : input.toString(),
    window.location.origin,
  );
  const token = url.searchParams.get('context');
  if (url.pathname.endsWith('/passkey/generate-register-options') && token) {
    return fetch('/api/v1/enrollment/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'same-origin',
    });
  }
  return fetch(input, init);
};
export const authClient = createAuthClient({
  plugins: [passkeyClient()],
  fetchOptions: { customFetchImpl: authFetch },
});
