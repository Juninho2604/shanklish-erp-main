import Link from 'next/link';

export default function HomePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            {/* Hero Section */}
            <div className="relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-amber-400/30 to-orange-500/20 blur-3xl" />
                    <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-br from-orange-400/20 to-amber-500/30 blur-3xl" />
                </div>

                <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
                    <div className="text-center">
                        {/* Logo */}
                        <div className="mb-8 inline-flex items-center justify-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl shadow-amber-500/25">
                                <span className="text-4xl">🧀</span>
                            </div>
                        </div>

                        {/* Title */}
                        <h1 className="mb-2 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl">
                            CAPSULA
                        </h1>

                        <p className="mx-auto mb-2 max-w-2xl text-xl text-gray-800 font-medium dark:text-gray-200">
                            Shanklish Caracas
                        </p>

                        <p className="mx-auto mb-2 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
                            Sistema de Gestión Empresarial
                        </p>

                        <p className="mx-auto mb-10 max-w-xl text-gray-500 dark:text-gray-400">
                            Controla tu inventario, recetas y costos en tiempo real
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row px-4">
                            <Link
                                href="/dashboard"
                                className="group relative inline-flex w-full sm:w-auto items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:shadow-xl hover:shadow-amber-500/40"
                            >
                                <span className="relative z-10">Entrar al Sistema</span>
                                <svg className="relative z-10 h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                                <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-amber-500 opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <div className="relative mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
                <div className="grid gap-6 md:grid-cols-3">
                    {/* Feature 1 */}
                    <div className="group rounded-2xl border border-amber-200/50 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/80">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl text-white shadow-lg shadow-blue-500/25">
                            📦
                        </div>
                        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                            Control de Inventario
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Monitorea stock en tiempo real, alertas de reabastecimiento y gestión multi-ubicación.
                        </p>
                    </div>

                    {/* Feature 2 */}
                    <div className="group rounded-2xl border border-amber-200/50 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/80">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-2xl text-white shadow-lg shadow-emerald-500/25">
                            📋
                        </div>
                        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                            Recetas y Sub-recetas
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Gestión recursiva de recetas con cálculo automático de costos y control de mermas.
                        </p>
                    </div>

                    {/* Feature 3 */}
                    <div className="group rounded-2xl border border-amber-200/50 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/80">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-2xl text-white shadow-lg shadow-amber-500/25">
                            💰
                        </div>
                        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                            Costos en Tiempo Real
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Calcula COGS automáticamente y mantén histórico de costos para análisis.
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-amber-200/50 bg-white/50 py-6 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/50">
                <div className="mx-auto max-w-7xl px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    <p>© 2026 CAPSULA - Shanklish Caracas</p>
                </div>
            </footer>
        </div>
    );
}
