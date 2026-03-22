import LoginForm from './login-form-client';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
    // Si ya existe sesión, redirigir al dashboard
    const session = await getSession();
    if (session) {
        redirect('/dashboard');
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-8 dark:bg-gray-900 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                <div className="flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                        <span className="text-3xl">🧀</span>
                    </div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                        Iniciar Sesión
                    </h2>
                    <p className="mt-2 text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                        CAPSULA - Shanklish Caracas
                    </p>
                </div>

                <LoginForm />

                <div className="mt-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-white px-2 text-gray-500 dark:bg-gray-800">
                                ¿Olvidaste tu contraseña?
                            </span>
                        </div>
                    </div>
                    <div className="mt-6 text-center text-xs text-gray-500">
                        Contacta al administrador del sistema para restablecer tu acceso.
                    </div>
                </div>
            </div>
        </div>
    );
}
