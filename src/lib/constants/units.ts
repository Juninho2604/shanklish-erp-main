/**
 * SHANKLISH CARACAS ERP - Units of Measure
 */

export const UnitOfMeasure = {
    KG: 'KG', G: 'G', LB: 'LB', OZ: 'OZ',
    L: 'L', ML: 'ML', GAL: 'GAL',
    UNIT: 'UNIT', DOZEN: 'DOZEN', PORTION: 'PORTION',
} as const;

export type UnitOfMeasureType = typeof UnitOfMeasure[keyof typeof UnitOfMeasure];

export const UNIT_INFO: Record<UnitOfMeasureType, {
    labelEs: string; symbol: string; toBaseMultiplier: number;
}> = {
    KG: { labelEs: 'Kilogramo', symbol: 'kg', toBaseMultiplier: 1 },
    G: { labelEs: 'Gramo', symbol: 'g', toBaseMultiplier: 0.001 },
    LB: { labelEs: 'Libra', symbol: 'lb', toBaseMultiplier: 0.453592 },
    OZ: { labelEs: 'Onza', symbol: 'oz', toBaseMultiplier: 0.0283495 },
    L: { labelEs: 'Litro', symbol: 'L', toBaseMultiplier: 1 },
    ML: { labelEs: 'Mililitro', symbol: 'mL', toBaseMultiplier: 0.001 },
    GAL: { labelEs: 'Galón', symbol: 'gal', toBaseMultiplier: 3.78541 },
    UNIT: { labelEs: 'Unidad', symbol: 'u', toBaseMultiplier: 1 },
    DOZEN: { labelEs: 'Docena', symbol: 'dz', toBaseMultiplier: 12 },
    PORTION: { labelEs: 'Porción', symbol: 'porc', toBaseMultiplier: 1 },
};

export function convertUnit(value: number, from: UnitOfMeasureType, to: UnitOfMeasureType): number {
    return (value * UNIT_INFO[from].toBaseMultiplier) / UNIT_INFO[to].toBaseMultiplier;
}

export function formatQuantity(value: number, unit: UnitOfMeasureType): string {
    return `${value.toLocaleString('es-VE', { maximumFractionDigits: 3 })} ${UNIT_INFO[unit].symbol}`;
}
