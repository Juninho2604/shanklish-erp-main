'use client';

import { useState, useEffect } from 'react';
import { getPOSConfig, setPOSConfig, type POSConfig } from '@/lib/pos-settings';

export default function POSConfigPage() {
  const [config, setConfig] = useState<POSConfig | null>(null);

  useEffect(() => {
    setConfig(getPOSConfig());
  }, []);

  const toggle = (key: keyof POSConfig, value: boolean) => {
    const next = setPOSConfig({ [key]: value });
    setConfig(next);
  };

  if (!config) return <div className="p-8 text-white">Cargando...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 text-white">
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          Configuración POS
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Activa o desactiva la impresión automática en cada módulo. Los cambios se aplican de inmediato.
        </p>
      </div>

      <div className="space-y-6">
        {/* Delivery */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="font-bold text-lg text-blue-300 mb-4 flex items-center gap-2">
            🛵 POS Delivery
          </h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-gray-300">Imprimir comanda cocina al confirmar</span>
              <button
                onClick={() => toggle('printComandaOnDelivery', !config.printComandaOnDelivery)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.printComandaOnDelivery ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.printComandaOnDelivery ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-gray-300">Imprimir factura automáticamente al confirmar</span>
              <button
                onClick={() => toggle('printReceiptOnDelivery', !config.printReceiptOnDelivery)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.printReceiptOnDelivery ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.printReceiptOnDelivery ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>

        {/* Restaurante */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="font-bold text-lg text-green-300 mb-4 flex items-center gap-2">
            🥙 POS Restaurante
          </h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-gray-300">Imprimir comanda cocina al enviar a mesa</span>
              <button
                onClick={() => toggle('printComandaOnRestaurant', !config.printComandaOnRestaurant)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.printComandaOnRestaurant ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.printComandaOnRestaurant ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-gray-300">Imprimir factura al registrar pago (cerrar cuenta)</span>
              <button
                onClick={() => toggle('printReceiptOnRestaurant', !config.printReceiptOnRestaurant)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.printReceiptOnRestaurant ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.printReceiptOnRestaurant ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        La configuración se guarda en este navegador. Siempre puedes reimprimir facturas desde el Historial de Ventas.
      </p>
    </div>
  );
}
