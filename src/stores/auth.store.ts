import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, UserRole, canViewCosts } from '@/types';
import { mockCurrentUser } from '@/lib/mock-data';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // Actions
    login: (user: User) => void;
    logout: () => void;
    setRole: (role: UserRole) => void; // Para testing de roles

    // Helpers
    canViewCosts: () => boolean;
    hasRole: (roles: UserRole[]) => boolean;
    getRoleLevel: () => number;
}

const ROLE_LEVELS: Record<UserRole, number> = {
    OWNER: 1,
    AUDITOR: 2,
    ADMIN_MANAGER: 3,
    OPS_MANAGER: 4,
    HR_MANAGER: 5,
    CHEF: 6,
    AREA_LEAD: 7,
};

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // Estado inicial - usuario mock para desarrollo
            user: mockCurrentUser,
            isAuthenticated: true, // En desarrollo, siempre autenticado
            isLoading: false,

            login: (user) => set({ user, isAuthenticated: true }),

            logout: () => set({ user: null, isAuthenticated: false }),

            // Permite cambiar rol para probar permisos en UI
            setRole: (role) => {
                const currentUser = get().user;
                if (currentUser) {
                    set({ user: { ...currentUser, role } });
                }
            },

            canViewCosts: () => {
                const user = get().user;
                return user ? canViewCosts(user.role) : false;
            },

            hasRole: (roles) => {
                const user = get().user;
                return user ? roles.includes(user.role) : false;
            },

            getRoleLevel: () => {
                const user = get().user;
                return user ? ROLE_LEVELS[user.role] : 999;
            },
        }),
        {
            name: 'shanklish-auth',
            partialize: (state) => ({ user: state.user }),
        }
    )
);
