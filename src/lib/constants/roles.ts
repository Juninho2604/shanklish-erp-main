/**
 * SHANKLISH CARACAS ERP - Role & Permission Constants
 * 
 * Define la jerarquía de usuarios y permisos del sistema
 */

export const UserRole = {
  OWNER: 'OWNER',
  AUDITOR: 'AUDITOR',
  ADMIN_MANAGER: 'ADMIN_MANAGER',
  OPS_MANAGER: 'OPS_MANAGER',
  HR_MANAGER: 'HR_MANAGER',
  CHEF: 'CHEF',
  AREA_LEAD: 'AREA_LEAD',
  CASHIER_RESTAURANT: 'CASHIER_RESTAURANT',
  CASHIER_DELIVERY: 'CASHIER_DELIVERY',
  KITCHEN_CHEF: 'KITCHEN_CHEF',
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

/**
 * Nivel jerárquico de cada rol (menor número = mayor rango)
 */
export const ROLE_HIERARCHY: Record<UserRoleType, number> = {
  [UserRole.OWNER]: 1,
  [UserRole.AUDITOR]: 2,
  [UserRole.ADMIN_MANAGER]: 3,
  [UserRole.OPS_MANAGER]: 4,
  [UserRole.HR_MANAGER]: 5,
  [UserRole.CHEF]: 6,
  [UserRole.AREA_LEAD]: 7,
  [UserRole.KITCHEN_CHEF]: 7,
  [UserRole.CASHIER_RESTAURANT]: 8,
  [UserRole.CASHIER_DELIVERY]: 8,
};

/**
 * Información de cada rol para UI
 */
export const ROLE_INFO: Record<UserRoleType, {
  label: string;
  labelEs: string;
  description: string;
  color: string;
}> = {
  [UserRole.OWNER]: {
    label: 'Owner',
    labelEs: 'Dueño',
    description: 'Acceso total al sistema',
    color: '#8B5CF6', // Purple
  },
  [UserRole.AUDITOR]: {
    label: 'Auditor',
    labelEs: 'Auditor',
    description: 'Solo lectura, acceso a auditoría',
    color: '#6366F1', // Indigo
  },
  [UserRole.ADMIN_MANAGER]: {
    label: 'Admin Manager',
    labelEs: 'Gerente Administrativo',
    description: 'Gestión administrativa y financiera',
    color: '#3B82F6', // Blue
  },
  [UserRole.OPS_MANAGER]: {
    label: 'Ops Manager',
    labelEs: 'Gerente Operativo',
    description: 'Gestión de operaciones y producción',
    color: '#10B981', // Emerald
  },
  [UserRole.HR_MANAGER]: {
    label: 'HR Manager',
    labelEs: 'Gerente RRHH',
    description: 'Gestión de recursos humanos',
    color: '#F59E0B', // Amber
  },
  [UserRole.CHEF]: {
    label: 'Chef',
    labelEs: 'Chef',
    description: 'Creación de recetas y producción',
    color: '#EF4444', // Red
  },
  [UserRole.AREA_LEAD]: {
    label: 'Area Lead',
    labelEs: 'Jefe de Área',
    description: 'Gestión de área específica',
    color: '#6B7280', // Gray
  },
  [UserRole.CASHIER_RESTAURANT]: {
    label: 'Cashier Restaurant',
    labelEs: 'Cajera Restaurante',
    description: 'Punto de venta del restaurante',
    color: '#059669', // Teal
  },
  [UserRole.CASHIER_DELIVERY]: {
    label: 'Cashier Delivery',
    labelEs: 'Cajera Delivery',
    description: 'Punto de venta para delivery',
    color: '#7C3AED', // Violet
  },
  [UserRole.KITCHEN_CHEF]: {
    label: 'Kitchen Chef',
    labelEs: 'Jefe de Cocina',
    description: 'Comandera de cocina',
    color: '#DC2626', // Red
  },
};

/**
 * Módulos del sistema
 */
export const SystemModule = {
  DASHBOARD: 'dashboard',
  OPERATIONS: 'operations',
  INVENTORY: 'inventory',
  RECIPES: 'recipes',
  PRODUCTION: 'production',
  COSTS: 'costs',
  ADMINISTRATION: 'administration',
  USERS: 'users',
  FINANCES: 'finances',
  HR: 'hr',
  REPORTS: 'reports',
  AUDIT: 'audit',
  SETTINGS: 'settings',
  // POS - Nuevos módulos
  POS_RESTAURANT: 'pos_restaurant',
  POS_DELIVERY: 'pos_delivery',
  MENU: 'menu',
  SALES_HISTORY: 'sales_history',
  KITCHEN_DISPLAY: 'kitchen_display',
} as const;

export type SystemModuleType = typeof SystemModule[keyof typeof SystemModule];

/**
 * Acciones posibles por módulo
 */
export const Permission = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  APPROVE: 'approve',
  EXPORT: 'export',
} as const;

export type PermissionType = typeof Permission[keyof typeof Permission];

/**
 * Matriz de permisos por rol y módulo
 * Define qué puede hacer cada rol en cada módulo
 */
export const ROLE_PERMISSIONS: Record<UserRoleType, Partial<Record<SystemModuleType, PermissionType[]>>> = {
  [UserRole.OWNER]: {
    // Acceso total a todos los módulos
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.OPERATIONS]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.INVENTORY]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.RECIPES]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.PRODUCTION]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.COSTS]: ['view', 'create', 'edit', 'delete', 'export'],
    [SystemModule.ADMINISTRATION]: ['view', 'create', 'edit', 'delete'],
    [SystemModule.USERS]: ['view', 'create', 'edit', 'delete'],
    [SystemModule.FINANCES]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.HR]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.REPORTS]: ['view', 'export'],
    [SystemModule.AUDIT]: ['view', 'export'],
    [SystemModule.SETTINGS]: ['view', 'edit'],
    // POS
    [SystemModule.POS_RESTAURANT]: ['view', 'create', 'edit', 'delete'],
    [SystemModule.POS_DELIVERY]: ['view', 'create', 'edit', 'delete'],
    [SystemModule.MENU]: ['view', 'create', 'edit', 'delete'],
    [SystemModule.SALES_HISTORY]: ['view', 'export'],
  },

  [UserRole.AUDITOR]: {
    // Solo lectura en todos los módulos
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.OPERATIONS]: ['view'],
    [SystemModule.INVENTORY]: ['view'],
    [SystemModule.RECIPES]: ['view'],
    [SystemModule.PRODUCTION]: ['view'],
    [SystemModule.COSTS]: ['view'],
    [SystemModule.ADMINISTRATION]: ['view'],
    [SystemModule.USERS]: ['view'],
    [SystemModule.FINANCES]: ['view'],
    [SystemModule.HR]: ['view'],
    [SystemModule.REPORTS]: ['view', 'export'],
    [SystemModule.AUDIT]: ['view', 'export'],
    [SystemModule.SETTINGS]: ['view'],
  },

  [UserRole.ADMIN_MANAGER]: {
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.OPERATIONS]: ['view'],
    [SystemModule.INVENTORY]: ['view', 'export'],
    [SystemModule.RECIPES]: ['view'],
    [SystemModule.PRODUCTION]: ['view'],
    [SystemModule.COSTS]: ['view', 'export'],
    [SystemModule.ADMINISTRATION]: ['view', 'create', 'edit'],
    [SystemModule.USERS]: ['view', 'create', 'edit'], // No puede gestionar OWNER/AUDITOR
    [SystemModule.FINANCES]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.HR]: ['view'],
    [SystemModule.REPORTS]: ['view', 'export'],
    [SystemModule.SETTINGS]: ['view', 'edit'],
  },

  [UserRole.OPS_MANAGER]: {
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.OPERATIONS]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.INVENTORY]: ['view', 'create', 'edit', 'delete', 'export'],
    [SystemModule.RECIPES]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.PRODUCTION]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.COSTS]: ['view', 'export'],
    [SystemModule.REPORTS]: ['view', 'export'],
    // POS
    [SystemModule.POS_RESTAURANT]: ['view', 'create', 'edit'],
    [SystemModule.POS_DELIVERY]: ['view', 'create', 'edit'],
    [SystemModule.MENU]: ['view', 'create', 'edit'],
    [SystemModule.SALES_HISTORY]: ['view', 'export'],
  },

  [UserRole.HR_MANAGER]: {
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.USERS]: ['view'],
    [SystemModule.HR]: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    [SystemModule.REPORTS]: ['view', 'export'],
  },

  [UserRole.CHEF]: {
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.INVENTORY]: ['view'],
    [SystemModule.RECIPES]: ['view', 'create', 'edit'],
    [SystemModule.PRODUCTION]: ['view', 'create', 'edit'],
    [SystemModule.COSTS]: ['view'],
  },

  [UserRole.AREA_LEAD]: {
    [SystemModule.DASHBOARD]: ['view'],
    [SystemModule.INVENTORY]: ['view', 'edit'], // Solo de su área
    [SystemModule.RECIPES]: ['view'],
    [SystemModule.PRODUCTION]: ['view', 'create'], // Reportar producción
  },

  [UserRole.CASHIER_RESTAURANT]: {
    // Solo acceso al POS de restaurante
    [SystemModule.POS_RESTAURANT]: ['view', 'create'],
    [SystemModule.SALES_HISTORY]: ['view'], // Solo sus ventas del día
  },

  [UserRole.CASHIER_DELIVERY]: {
    // Solo acceso al POS de delivery
    [SystemModule.POS_DELIVERY]: ['view', 'create'],
    [SystemModule.SALES_HISTORY]: ['view'], // Solo sus ventas del día
  },

  [UserRole.KITCHEN_CHEF]: {
    // Solo acceso a la comandera de cocina
    [SystemModule.KITCHEN_DISPLAY]: ['view'],
  },
};

/**
 * Utilidad: Verificar si un rol tiene permiso específico
 */
export function hasPermission(
  role: UserRoleType,
  module: SystemModuleType,
  permission: PermissionType
): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role];
  if (!rolePermissions) return false;

  const modulePermissions = rolePermissions[module];
  if (!modulePermissions) return false;

  return modulePermissions.includes(permission);
}

/**
 * Utilidad: Verificar si un rol puede actuar sobre otro
 * (Basado en jerarquía - solo roles superiores pueden modificar inferiores)
 */
export function canManageRole(actorRole: UserRoleType, targetRole: UserRoleType): boolean {
  // Nadie puede modificar a alguien de igual o mayor rango
  return ROLE_HIERARCHY[actorRole] < ROLE_HIERARCHY[targetRole];
}

/**
 * Obtener roles que un usuario puede crear/editar
 */
export function getManageableRoles(actorRole: UserRoleType): UserRoleType[] {
  return Object.entries(ROLE_HIERARCHY)
    .filter(([_, level]) => level > ROLE_HIERARCHY[actorRole])
    .map(([role, _]) => role as UserRoleType);
}
