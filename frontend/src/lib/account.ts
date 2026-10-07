import { createContext, useContext } from 'react';

/** The signed-in account's role, as stored by the backend (GET /api/me). */
export interface Profile {
  id: string;
  role: 'HOSPITAL' | 'PATIENT';
  patient_id: string | null;
  hospital_org?: string | null;
}

export const AccountContext = createContext<Profile | null>(null);

export function useAccount() {
  const profile = useContext(AccountContext);
  if (!profile) throw new Error('useAccount must be used inside <RequireAccount>');
  return profile;
}
