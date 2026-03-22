import { Suspense } from 'react';
import ProteinProcessingView from './protein-processing-view';

export const dynamic = 'force-dynamic';

export default function ProteinasPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Cargando módulo de proteínas...</p>
                </div>
            </div>
        }>
            <ProteinProcessingView />
        </Suspense>
    );
}
