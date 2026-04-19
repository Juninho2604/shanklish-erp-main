import LoginForm from './login-form-client';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CapsulaLogo from '@/components/ui/CapsulaLogo';

export default async function LoginPage() {
    // Si ya existe sesión, redirigir al dashboard
    const session = await getSession();
    if (session) {
        redirect('/dashboard');
    }

    return (
        <div
            className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12"
            style={{
                background: 'linear-gradient(145deg, #FF6B4A 0%, #E85A3A 38%, #2A4060 72%, #1B2D45 100%)',
            }}
        >
            {/* Noise texture overlay — da profundidad sin ruido */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                    backgroundSize: '128px 128px',
                }}
            />

            {/* Glow orbs decorativos */}
            <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />

            {/* Logo + Tagline — sobre la card */}
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
                <CapsulaLogo
                    variant="full"
                    size={44}
                    color="white"
                    textColor="white"
                />
                <p className="mt-1 text-sm font-medium tracking-wide text-white/60">
                    El ERP inteligente para tu restaurante
                </p>
            </div>

            {/* Card principal */}
            <div className="w-full max-w-[400px]">
                <div
                    className="rounded-2xl p-8 shadow-2xl"
                    style={{
                        background: 'rgba(255, 255, 255, 0.97)',
                        boxShadow: '0 32px 64px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(16px)',
                    }}
                >
                    <div className="mb-6">
                        <h1
                            className="text-2xl text-gray-900"
                            style={{ fontFamily: "'Nunito', system-ui, sans-serif", fontWeight: 800 }}
                        >
                            Iniciar Sesión
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Ingresa tus credenciales para continuar
                        </p>
                    </div>

                    <LoginForm />

                    <div className="mt-6 border-t border-gray-100 pt-5">
                        <p className="text-center text-xs text-gray-400">
                            ¿Olvidaste tu contraseña?{' '}
                            <span className="font-medium text-gray-500">
                                Contacta al administrador del sistema.
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <p className="mt-8 text-xs text-white/30 tracking-wider">
                © 2026 CÁPSULA · Todos los derechos reservados
            </p>
        </div>
    );
}
