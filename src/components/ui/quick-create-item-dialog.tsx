"use client"

import { useState, useEffect } from "react"
import { X, Package, Loader2, AlertTriangle, Info } from "lucide-react"
import * as ReactDOM from "react-dom"
import { createQuickItem } from "@/app/actions/inventory.actions"

interface Area {
    id: string
    name: string
}

interface QuickCreateItemDialogProps {
    open: boolean
    onClose: () => void
    onItemCreated: (item: { id: string; name: string; baseUnit: string }, transferQuantity?: number) => void
    initialName: string
    initialTransferQuantity?: number   // Cantidad que el usuario ya escribió en la fila
    userId: string
    areasList?: Area[]                 // Lista de áreas para elegir el almacén de origen
    sourceAreaId?: string              // Almacén de origen de la transferencia (pre-seleccionado)
}

const UNIT_OPTIONS = [
    { value: "KG",      label: "KG - Kilogramos" },
    { value: "G",       label: "G - Gramos" },
    { value: "L",       label: "L - Litros" },
    { value: "ML",      label: "ML - Mililitros" },
    { value: "UNIT",    label: "UND - Unidades" },
    { value: "PORTION", label: "Porciones" },
]

const TYPE_OPTIONS = [
    { value: "RAW_MATERIAL",  label: "🥩 Materia Prima",           desc: "Insumo crudo sin procesar" },
    { value: "SUB_RECIPE",    label: "🧀 Sub-receta / Preparación", desc: "Producto intermedio procesado" },
    { value: "FINISHED_GOOD", label: "🍽️ Producto Terminado",       desc: "Se vende directamente al cliente" },
]

export function QuickCreateItemDialog({
    open,
    onClose,
    onItemCreated,
    initialName,
    initialTransferQuantity,
    userId,
    areasList = [],
    sourceAreaId: defaultSourceAreaId = "",
}: QuickCreateItemDialogProps) {
    const [name, setName]           = useState(initialName)
    const [unit, setUnit]           = useState("KG")
    const [type, setType]           = useState("RAW_MATERIAL")
    const [loading, setLoading]     = useState(false)
    const [error, setError]         = useState("")

    // Campos de stock
    const [stockAreaId, setStockAreaId]   = useState(defaultSourceAreaId)
    const [initialStock, setInitialStock] = useState<string>("")
    const [transferQty, setTransferQty]   = useState<string>(initialTransferQuantity ? String(initialTransferQuantity) : "")
    const [confirmed, setConfirmed]       = useState(false)

    // Reset al abrir con un nombre nuevo
    useEffect(() => {
        if (open) {
            setName(initialName)
            setUnit("KG")
            setType("RAW_MATERIAL")
            setError("")
            setStockAreaId(defaultSourceAreaId)
            setInitialStock("")
            setTransferQty(initialTransferQuantity ? String(initialTransferQuantity) : "")
            setConfirmed(false)
            setLoading(false)
        }
    }, [open, initialName, defaultSourceAreaId, initialTransferQuantity])

    if (!open) return null

    const stockAreaName = areasList.find(a => a.id === stockAreaId)?.name ?? "no seleccionado"
    const parsedStock    = parseFloat(initialStock)
    const parsedTransfer = parseFloat(transferQty)
    const transferExceedsStock = stockAreaId && !isNaN(parsedStock) && !isNaN(parsedTransfer) && parsedTransfer > parsedStock

    const handleCreate = async () => {
        if (!name.trim()) {
            setError("El nombre es obligatorio")
            return
        }
        if (!confirmed) {
            setError("Debes confirmar que coordinaste el nombre con el equipo")
            return
        }
        if (stockAreaId && !isNaN(parsedStock) && parsedStock < 0) {
            setError("El stock inicial debe ser ≥ 0")
            return
        }
        if (transferExceedsStock) {
            setError(`No puedes transferir ${parsedTransfer} si solo hay ${parsedStock} ${unit} en "${stockAreaName}"`)
            return
        }

        setError("")
        setLoading(true)
        try {
            const result = await createQuickItem({
                name: name.trim(),
                unit,
                type,
                userId,
                sourceAreaId:   stockAreaId   || undefined,
                initialStock:   (!isNaN(parsedStock) && parsedStock > 0) ? parsedStock : undefined,
                isFinalProduct: type === "FINISHED_GOOD",
            })
            if (result.success && result.item) {
                onItemCreated(
                    { id: result.item.id, name: result.item.name, baseUnit: result.item.baseUnit },
                    isNaN(parsedTransfer) ? undefined : parsedTransfer
                )
                onClose()
            } else {
                setError(result.message || "Error al crear el producto")
            }
        } catch (err) {
            console.error("Error creando item:", err)
            setError("Error inesperado al crear el producto")
        } finally {
            setLoading(false)
        }
    }

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/70 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">

                {/* ── Header ─────────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                            <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">Crear Producto Nuevo</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Se agregará al inventario del sistema</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <X className="h-5 w-5 text-gray-400" />
                    </button>
                </div>

                {/* ── Aviso de coordinación (siempre visible) ─────── */}
                <div className="mx-5 mt-4 flex gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Antes de crear este producto</p>
                        <p className="text-amber-700 dark:text-amber-400 text-xs">
                            Asegúrate de que <strong>este producto no existe ya</strong> en el sistema con otro nombre.
                            Coordina con los demás jefes de cocina y producción para usar el <strong>mismo nombre de referencia</strong>.
                            Crear duplicados dificulta el control de inventario.
                        </p>
                        <label className="mt-2 flex items-start gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={e => setConfirmed(e.target.checked)}
                                className="mt-0.5 accent-amber-600"
                            />
                            <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                                Confirmo que verifiqué que no existe y coordiné el nombre con el equipo
                            </span>
                        </label>
                    </div>
                </div>

                {/* ── Body scrollable ─────────────────────────────── */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                    {/* Nombre */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Nombre del Producto <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Carne Macerada Shawarma"
                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                            autoFocus
                        />
                    </div>

                    {/* Unidad + Tipo */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Unidad */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Unidad
                            </label>
                            <div className="grid grid-cols-2 gap-1">
                                {UNIT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setUnit(opt.value)}
                                        className={`px-2 py-2 text-xs rounded-lg border transition-all min-h-[38px] text-left font-mono
                                            ${unit === opt.value
                                                ? "border-amber-500 bg-amber-50 text-amber-800 font-semibold dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600"
                                                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tipo */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Tipo
                            </label>
                            <div className="space-y-1.5">
                                {TYPE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setType(opt.value)}
                                        className={`w-full flex flex-col px-3 py-2 text-xs rounded-xl border transition-all text-left min-h-[44px]
                                            ${type === opt.value
                                                ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-600"
                                                : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                                            }`}
                                    >
                                        <span className={`font-semibold ${type === opt.value ? "text-amber-800 dark:text-amber-300" : "text-gray-700 dark:text-gray-300"}`}>
                                            {opt.label}
                                        </span>
                                        <span className="text-gray-400 dark:text-gray-500 text-[10px]">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                            {type === "FINISHED_GOOD" && (
                                <p className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                    <Info className="h-3 w-3 flex-shrink-0" />
                                    Se creará una receta vacía automáticamente
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Sección de Stock ───────────────────────────── */}
                    <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                            📦 Stock Actual — Período de Migración
                        </p>

                        {/* Almacén donde está el producto ahora */}
                        {areasList.length > 0 && (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    ¿En qué almacén está este producto actualmente?
                                </label>
                                <select
                                    value={stockAreaId}
                                    onChange={e => setStockAreaId(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:border-blue-500 outline-none"
                                >
                                    <option value="">-- No registrar stock ahora --</option>
                                    {areasList.map(area => (
                                        <option key={area.id} value={area.id}>{area.name}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    Selecciona el área donde está físicamente este producto hoy
                                </p>
                            </div>
                        )}

                        {/* Stock total en ese almacén */}
                        {stockAreaId && (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Stock total en <strong>"{stockAreaName}"</strong> ahora mismo ({unit})
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={initialStock}
                                    onChange={e => setInitialStock(e.target.value)}
                                    placeholder="Ej: 15"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:border-blue-500 outline-none font-mono"
                                />
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    Este valor quedará registrado como inventario inicial en el sistema
                                </p>
                            </div>
                        )}

                        {/* Cantidad a transferir */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Cantidad a transferir en esta solicitud ({unit})
                            </label>
                            <input
                                type="number"
                                min={0}
                                step="any"
                                value={transferQty}
                                onChange={e => setTransferQty(e.target.value)}
                                placeholder="Ej: 5"
                                className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800 dark:text-white focus:outline-none font-mono transition-colors
                                    ${transferExceedsStock
                                        ? "border-red-400 dark:border-red-600 focus:border-red-500"
                                        : "border-gray-200 dark:border-gray-700 focus:border-blue-500"
                                    }`}
                            />
                            {transferExceedsStock && (
                                <p className="text-[11px] text-red-500 mt-0.5">
                                    ⚠️ Supera el stock disponible ({parsedStock} {unit} en "{stockAreaName}")
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                            ❌ {error}
                        </p>
                    )}
                </div>

                {/* ── Footer ─────────────────────────────────────── */}
                <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors min-h-[44px] disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={loading || !name.trim() || !confirmed}
                        className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</>
                        ) : (
                            <><Package className="h-4 w-4" /> Crear y Agregar a la Transferencia</>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}
