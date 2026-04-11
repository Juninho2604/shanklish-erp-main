'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

// ============================================================================
// GUÍAS POR MÓDULO
// ============================================================================

interface ModuleGuide {
  title: string;
  icon: string;
  description: string;
  steps: string[];
  tips: string[];
  standards?: { label: string; example: string }[];
}

const HELP_GUIDES: Record<string, ModuleGuide> = {
  '/dashboard/pos/restaurante': {
    title: 'POS Restaurante',
    icon: '🥙',
    description: 'Punto de venta para consumo en el local. El cajero gestiona mesas, órdenes y cobros.',
    steps: [
      'Selecciona la zona (Sala Principal / Bar)',
      'Haz clic en la mesa del cliente',
      'Pulsa "Abrir cuenta" e ingresa nombre + teléfono',
      'Agrega los productos desde el menú central',
      'Presiona "Enviar a cocina" — la comanda va automáticamente',
      'Cuando el cliente pida la cuenta, selecciona el método de pago y presiona "Cobrar"',
      'Los descuentos requieren PIN del gerente — quedan registrados',
    ],
    tips: [
      'Mesa verde con punto = cuenta abierta activa',
      'Puedes agregar más productos a una cuenta ya abierta',
      'El 10% de servicio se aplica automáticamente a Sala (desactivable)',
      'Venta Directa / Pickup = para llevar sin asignar mesa',
      'Si la comanda no imprime, revisa Configuración POS',
    ],
    standards: [
      { label: 'Nombre cliente', example: '"Omar Ramírez" — nombre completo, no apodos' },
      { label: 'Teléfono', example: '"0412-1234567" — con prefijo, obligatorio' },
    ],
  },
  '/dashboard/pos/delivery': {
    title: 'POS Delivery',
    icon: '🛵',
    description: 'Para órdenes a domicilio. Registra datos del cliente y envía a cocina.',
    steps: [
      'Ingresa nombre, teléfono y dirección exacta del cliente',
      'Agrega los productos igual que en restaurante',
      'Selecciona el método de pago del cliente',
      'Presiona "Confirmar orden" — se envía a cocina automáticamente',
      'El botón WhatsApp abre el parser para importar pedidos directamente del chat',
    ],
    tips: [
      'El precio de delivery cambia si aplicas descuento Divisas (-33%)',
      'La dirección aparece en la comanda de cocina',
      'El parser de WhatsApp lee el formato de pedidos y carga el carrito automáticamente',
    ],
    standards: [
      { label: 'Dirección', example: '"Av. Principal, Edif. Torre Norte, Piso 3, Apto 3A, Chacao"' },
      { label: 'Nombre cliente', example: '"María González" — igual que en restaurante' },
    ],
  },
  '/dashboard/pos/mesero': {
    title: 'POS Mesero',
    icon: '🧑‍🍳',
    description: 'Vista exclusiva para mesoneros. Solo toma de pedidos — el cajero gestiona el cobro.',
    steps: [
      'Selecciona la zona y la mesa asignada',
      'Si la mesa no tiene cuenta, abre una con datos del cliente',
      'Agrega los productos del pedido',
      'Presiona "Enviar a cocina" — la comanda va inmediatamente',
      'Puedes ver el estado de los pedidos enviados (En cocina / Listo)',
      'Para anular un ítem ya enviado necesitas justificación + PIN del supervisor',
    ],
    tips: [
      'El total es solo informativo — no puedes cobrar desde esta vista',
      'Puedes agregar más productos a la misma mesa en cualquier momento',
      'Verde = modo mesero activo',
    ],
  },
  '/dashboard/inventario': {
    title: 'Inventario',
    icon: '📦',
    description: 'Gestión completa de materias primas, sub-recetas y productos terminados.',
    steps: [
      'Crea cada ingrediente como un ítem de inventario (Materia Prima)',
      'Define la unidad de medida base correcta (ver estándares abajo)',
      'Establece stock mínimo y punto de reorden para alertas automáticas',
      'Usa "Entrada" para registrar compras recibidas',
      'El inventario se descuenta automáticamente al vender (si tiene receta vinculada)',
    ],
    tips: [
      'Las unidades deben ser consistentes en TODO el sistema',
      'Un ítem puede tener receta si se produce internamente',
      'Los ítems con receta vinculada se descuentan por ingrediente, no por producto',
      'El costo por unidad afecta el análisis de márgenes',
    ],
    standards: [
      { label: 'Carnes/Proteínas', example: 'Unidad: KG · SKU: CARN-001 · Ej: "Pollo Pechuga Fresco"' },
      { label: 'Lácteos', example: 'Unidad: KG o LT · SKU: LACT-001 · Ej: "Queso Blanco Duro"' },
      { label: 'Bebidas (botellas)', example: 'Unidad: BOTELLA o ML · SKU: BEB-001 · Ej: "Ron Añejo 750ml"' },
      { label: 'Bebidas (cócteles)', example: 'Unidad: ML · el consumo se resta por ML al vender' },
      { label: 'Especias/Secos', example: 'Unidad: GR · SKU: SPEC-001 · Ej: "Comino Molido"' },
      { label: 'Pan/Masas', example: 'Unidad: UNIDAD o KG · SKU: PAN-001 · Ej: "Pan de Pita 22cm"' },
      { label: 'Frutas/Vegetales', example: 'Unidad: KG · SKU: VEG-001 · Ej: "Tomate Plum"' },
    ],
  },
  '/dashboard/inventario/diario': {
    title: 'Inventario Diario',
    icon: '📅',
    description: 'Registro del inventario al inicio y cierre de cada día.',
    steps: [
      'Al abrir el local: registra el conteo inicial de cada área',
      'Al cerrar: registra el conteo final',
      'El sistema calcula automáticamente las diferencias vs las ventas',
      'Si hay diferencia significativa, genera una alerta de auditoría',
    ],
    tips: [
      'Hazlo a la misma hora todos los días para consistencia',
      'Separa por área: cocina, bar, depósito',
      'Una diferencia de ±2% es normal por mermas',
    ],
  },
  '/dashboard/recetas': {
    title: 'Recetas',
    icon: '📋',
    description: 'Define la composición de cada plato o bebida para el control de costos e inventario.',
    steps: [
      'Crea la receta con el nombre EXACTO del producto del menú',
      'Vincula el ítem de inventario de salida (ej: "Plato Shanklish Tradicional")',
      'Agrega cada ingrediente con su cantidad y unidad',
      'Incluye el porcentaje de desperdicio de cada ingrediente',
      'Activa la receta — solo recetas activas se descuentan al vender',
      'Vincula el ítem de menú con el ítem de inventario en la configuración de menú',
    ],
    tips: [
      'La receta de un cóctel debe usar ML de cada licor, no botellas',
      'Para platos con variaciones, crea una receta por variación',
      'El costo de la receta se calcula automáticamente según precios de compra',
      'Si un ingrediente no tiene stock registrado, la venta igual ocurre (sin bloqueo)',
    ],
    standards: [
      { label: 'Bebidas alcohólicas', example: 'Ron: 60ml, Jugo limón: 30ml, Azúcar: 15gr, Hielo: 100gr' },
      { label: 'Platos principales', example: 'Proteína: en KG (ej: 0.25kg), Guarnición: en GR o UNIDAD' },
      { label: 'Nombre receta', example: 'Debe coincidir EXACTO con el nombre en el Menú del POS' },
    ],
  },
  '/dashboard/produccion': {
    title: 'Producción',
    icon: '🏭',
    description: 'Registro de producciones internas: salsas, masas, sub-recetas y preparaciones.',
    steps: [
      'Selecciona la receta a producir',
      'Ingresa la cantidad a producir',
      'El sistema verifica si hay stock suficiente de ingredientes',
      'Confirma — los ingredientes se descuentan y el producto se agrega al inventario',
      'Registra la producción real vs planificada para control de rendimiento',
    ],
    tips: [
      'Usa producción para preparar bases: salsas, marinados, mezclas',
      'El rendimiento real vs teórico te dice cuánto se pierde en el proceso',
      'Programa producciones en la mañana antes de abrir',
    ],
  },
  '/dashboard/ventas/cargar': {
    title: 'Cargar Ventas',
    icon: '💳',
    description: 'Registro manual de ventas externas (PedidosYA, eventos, etc.)',
    steps: [
      'Ingresa la fecha de la venta',
      'Selecciona el tipo (delivery externo, evento, etc.)',
      'Carga los items y montos',
      'Estas ventas se suman al historial pero NO descuentan inventario automáticamente',
    ],
    tips: [
      'Solo usa este módulo para ventas que no pasan por el POS',
      'Para PedidosYA activa el módulo específico en Admin → Módulos',
    ],
  },
  '/dashboard/sales': {
    title: 'Historial de Ventas',
    icon: '📈',
    description: 'Registro completo de todas las ventas. Base para el arqueo y auditoría.',
    steps: [
      'Filtra por fecha para ver el día que necesitas',
      'Expande cada orden para ver los items detallados',
      'Usa "Exportar Arqueo" para descargar el cierre del día en Excel',
      'El botón "Reporte Z" genera el resumen por método de pago',
      'Para anular una orden necesitas PIN de gerente + justificación',
    ],
    tips: [
      'Las anulaciones quedan registradas permanentemente — no se pueden eliminar del historial',
      'El arqueo en Excel es el documento oficial para contabilidad',
      'Los descuentos aplicados aparecen con el nombre del gerente que los autorizó',
    ],
  },
  '/dashboard/estadisticas': {
    title: 'Estadísticas',
    icon: '📊',
    description: 'Panel de análisis en tiempo real. La información que ves depende de tu rol.',
    steps: [
      'DUEÑO/GERENTE: Ve revenue, métodos de pago, top productos, descuentos del día',
      'CHEF: Ve pedidos en cocina, producciones del día, ingredientes bajos',
      'CAJERO: Ve resumen de tu turno actual',
      'AUDITOR: Ve descuentos, anulaciones y variaciones de inventario',
    ],
    tips: [
      'Los datos son del momento actual — recarga la página para actualizar',
      'Las alertas de stock indican ítems por debajo del mínimo configurado',
      'Para ver datos históricos usa Historial de Ventas o Historial Mensual',
    ],
  },
};

// Guía genérica para rutas sin guía específica
const DEFAULT_GUIDE: ModuleGuide = {
  title: 'CAPSULA ERP',
  icon: '🧩',
  description: 'Sistema de gestión para restaurantes y locales tipo Sport Bar.',
  steps: [
    'Navega por los módulos del sidebar según tu rol',
    'Los módulos disponibles dependen de los permisos de tu usuario',
    'Para activar módulos adicionales ve a Admin → Módulos (solo OWNER)',
    'Cada módulo tiene su propia guía de uso — abre el panel de ayuda en ese módulo',
  ],
  tips: [
    'El POS Restaurante y Delivery son los módulos principales de operación diaria',
    'Las recetas deben cargarse antes de que el inventario se descuente automáticamente',
    'Las Estadísticas muestran datos en tiempo real personalizados por rol',
  ],
  standards: [
    { label: 'SKU productos', example: 'CARN-001, BEB-001, LACT-001 (categoría + número secuencial)' },
    { label: 'Nombres de productos', example: 'Usar nombre completo y descriptivo, sin abreviaciones' },
    { label: 'Unidades de medida', example: 'KG, GR, LT, ML, UNIDAD, BOTELLA (siempre en mayúsculas)' },
  ],
};

function getGuide(pathname: string): ModuleGuide {
  // Busca coincidencia exacta primero
  if (HELP_GUIDES[pathname]) return HELP_GUIDES[pathname];
  // Luego por prefijo (para sub-rutas)
  const match = Object.keys(HELP_GUIDES)
    .filter((key) => pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? HELP_GUIDES[match] : DEFAULT_GUIDE;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'guide' | 'standards'>('guide');
  const pathname = usePathname();
  const guide = getGuide(pathname);

  return (
    <>
      {/* Botón ayuda */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Ayuda y guía del módulo"
        aria-label="Abrir guía de ayuda"
      >
        <span className="text-xl">❓</span>
      </button>

      {/* Modal centrado con backdrop oscuro */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-2xl flex flex-col max-h-[90vh] shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-primary/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">
              {guide.icon}
            </div>
            <div>
              <h2 className="font-black text-base text-foreground">{guide.title}</h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Guía de uso</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="h-9 w-9 rounded-xl hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        {guide.standards && guide.standards.length > 0 && (
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('guide')}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
                activeTab === 'guide' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📋 Guía de uso
            </button>
            <button
              onClick={() => setActiveTab('standards')}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
                activeTab === 'standards' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📐 Estándares
            </button>
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'guide' ? (
            <>
              {/* Descripción */}
              <div className="bg-secondary/40 rounded-2xl p-4 border border-border">
                <p className="text-sm text-foreground/80 font-medium leading-relaxed">{guide.description}</p>
              </div>

              {/* Pasos */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                  Pasos del proceso
                </h3>
                <div className="space-y-2">
                  {guide.steps.map((step, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-sm text-foreground/80 font-medium leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                  💡 Recomendaciones
                </h3>
                <div className="space-y-2">
                  {guide.tips.map((tip, i) => (
                    <div key={i} className="flex gap-2 items-start p-4 bg-primary/5 rounded-2xl border border-primary/10">
                      <span className="text-primary text-xs shrink-0 mt-0.5">→</span>
                      <p className="text-xs text-foreground/70 font-medium leading-snug">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Estándares de nomenclatura */
            <div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-4">
                <p className="text-xs font-bold text-amber-400">
                  ⚠️ Los estándares son críticos para que el inventario se descuente correctamente.
                  Un nombre inconsistente rompe la conexión receta → venta → inventario.
                </p>
              </div>
              <div className="space-y-3">
                {guide.standards!.map((s, i) => (
                  <div key={i} className="p-4 bg-secondary/30 rounded-2xl border border-border">
                    <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{s.label}</div>
                    <div className="text-xs text-foreground/70 font-medium font-mono bg-background/50 rounded-lg p-2 mt-2">
                      {s.example}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/40">
          <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest text-center">
            CAPSULA ERP · Módulo: {guide.title}
          </p>
          <p className="text-[9px] text-muted-foreground/40 text-center mt-0.5">
            Para soporte contacta al administrador del sistema
          </p>
        </div>
          </div>
        </div>
      )}
    </>
  );
}
