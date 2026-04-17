-- Normaliza posGroup de las variantes Shakifel Mixto para que aparezcan
-- agrupadas en un único tile en el menú jerárquico del POS.
-- Idempotente: solo afecta los items cuyo nombre contenga 'shakifel' y 'mixto'.

UPDATE "MenuItem"
SET
    "posGroup"       = 'Shakifel Mixto',
    "posSubcategory" = COALESCE("posSubcategory", 'Shawarmas')
WHERE
    LOWER("name") LIKE '%shakifel%mixto%'
    AND "isActive" = true;
