import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
    title: 'CAPSULA de Shanklish Caracas',
    description: 'Sistema de Gestión e Inventario para Restauración y Manufactura de Alimentos',
    keywords: ['CAPSULA', 'ERP', 'restaurante', 'inventario', 'recetas', 'Shanklish', 'Caracas'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" suppressHydrationWarning>
            <head>
                {/* Aplica el tema antes del render para evitar flash */}
                <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme'),d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t===null&&d))document.documentElement.classList.add('dark');}())` }} />
            </head>
            <body className={`${inter.variable} font-sans antialiased`}>
                {children}
                <Toaster position="top-right" />
            </body>
        </html>
    );
}
