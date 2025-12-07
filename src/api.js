import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE = 'https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod';

const getAuthToken = async () => {
  const session = await fetchAuthSession();
  return session?.tokens?.idToken?.toString();
};

export const apiFetch = async (path, options = {}) => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated');
  }

  const mergedHeaders = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };

  if (!mergedHeaders['Content-Type'] && !(options.body instanceof FormData)) {
    mergedHeaders['Content-Type'] = 'application/json';
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: mergedHeaders
  });
};
