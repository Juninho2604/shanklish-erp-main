import { Suspense } from 'react';
import PurchaseOrderView from './purchase-order-view';

export const dynamic = 'force-dynamic';

export default function ComprasPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Cargando módulo de compras...</p>
                </div>
            </div>
        }>
            <PurchaseOrderView />
        </Suspense>
    );
}
