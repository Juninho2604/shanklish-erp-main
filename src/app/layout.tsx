import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
    title: 'Shanklish Caracas ERP',
    description: 'Sistema de Gestión para Restauración y Manufactura de Alimentos',
    keywords: ['ERP', 'restaurante', 'inventario', 'recetas', 'Shanklish', 'Caracas'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className={`${inter.variable} font-sans antialiased`}>
                {children}
            </body>
        </html>
    );
}
