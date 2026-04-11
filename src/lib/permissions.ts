export function hasPermission(userRole: string | undefined, requiredRoleLevel: number) {
    const roleLevels: Record<string, number> = {
        'OWNER': 100,
        'AUDITOR': 90,
        'ADMIN_MANAGER': 80,
        'OPS_MANAGER': 70,
        'HR_MANAGER': 60,
        'CHEF': 50,
        'AREA_LEAD': 40,
        'CASHIER': 20,
        'KITCHEN_CHEF': 15,
        'WAITER': 15,
        'STAFF': 10,
    };

    const userLevel = roleLevels[userRole || 'STAFF'] || 0;
    return userLevel >= requiredRoleLevel;
}

export const PERMISSIONS = {
    CONFIGURE_ROLES: 70, // Solo Gerentes Ops (70) hacia arriba pueden configurar roles
    APPROVE_TRANSFERS: 40, // Jefes de Área pueden aprobar (REVISAR LÓGICA DE NEGOCIO)
    VIEW_COSTS: 80, // Solo Gerentes Admin hacia arriba ven costos detallados

    // Gestión de usuarios
    VIEW_USERS: 60, // HR Manager (60) y superiores
    MANAGE_USERS: 70, // Ops Manager (70) y superiores
};
