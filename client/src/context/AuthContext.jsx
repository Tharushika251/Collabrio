import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { TOKEN_KEY, USER_KEY } from '../utils/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  const persist = (u, token) => {
    setUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    if (token) localStorage.setItem(TOKEN_KEY, token);
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', payload);
      persist(data.user, data.token);
    } finally {
      setLoading(false);
    }
  };

  const login = async (payload) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', payload);
      persist(data.user, data.token);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  };

  // Refresh user on mount in case the record changed server-side.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    api
      .get('/auth/me')
      .then(({ data }) => persist(data.user))
      .catch(() => logout());
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);