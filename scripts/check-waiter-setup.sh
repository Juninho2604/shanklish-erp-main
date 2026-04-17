#!/usr/bin/env bash
# check-waiter-setup.sh
# Diagnóstico del sistema de mesoneros con PIN.
# Uso: DATABASE_URL="postgresql://user:pass@host:5432/db" bash scripts/check-waiter-setup.sh
#   o: bash scripts/check-waiter-setup.sh  (si DATABASE_URL ya está en el entorno)

set -euo pipefail

DB="${DATABASE_URL:-}"
if [ -z "$DB" ]; then
    echo "❌ Falta DATABASE_URL."
    echo "   Uso: DATABASE_URL=\"postgresql://...\" bash scripts/check-waiter-setup.sh"
    exit 1
fi

run() { psql "$DB" -t -A -c "$1" 2>&1; }

echo ""
echo "══════════════════════════════════════════════════════"
echo "         DIAGNÓSTICO — WAITER PIN SETUP"
echo "══════════════════════════════════════════════════════"
echo ""

# ── 1. Sucursales ─────────────────────────────────────────────────────────────
echo "📍 SUCURSALES"
BRANCHES=$(run 'SELECT id, name, code, "isActive" FROM "Branch" ORDER BY "isActive" DESC, name ASC')
if [ -z "$BRANCHES" ]; then
    echo "   ⛔  NO HAY SUCURSALES en la base de datos."
else
    echo "$BRANCHES" | while IFS='|' read -r id name code active; do
        [ "$active" = "t" ] && s="✅ ACTIVA " || s="❌ inactiva"
        echo "   $s  code=$code  name=\"$name\"  id=$id"
    done
fi

ACTIVE_BRANCH_ID=$(run 'SELECT id FROM "Branch" WHERE "isActive" = true LIMIT 1')
ACTIVE_BRANCH_NAME=$(run 'SELECT name FROM "Branch" WHERE "isActive" = true LIMIT 1')
if [ -z "$ACTIVE_BRANCH_ID" ]; then
    echo ""
    echo "   ⛔  PROBLEMA CRÍTICO: ninguna sucursal tiene isActive=true."
    echo "       validateWaiterPinAction fallará siempre con 'Sin sucursal activa'."
fi

# ── 2. Mesoneros ──────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────"
echo "🧑‍🍳 MESONEROS"

TOTAL=$(run 'SELECT COUNT(*) FROM "Waiter"')
WITH_PIN=$(run 'SELECT COUNT(*) FROM "Waiter" WHERE pin IS NOT NULL')
WITHOUT_PIN=$(run 'SELECT COUNT(*) FROM "Waiter" WHERE pin IS NULL')
ACTIVE_W=$(run 'SELECT COUNT(*) FROM "Waiter" WHERE "isActive" = true')
CAPTAINS=$(run 'SELECT COUNT(*) FROM "Waiter" WHERE "isCaptain" = true')

echo "   Total: $TOTAL  |  Activos: $ACTIVE_W  |  Con PIN: $WITH_PIN  |  Sin PIN: $WITHOUT_PIN  |  Capitanes: $CAPTAINS"
echo ""

if [ "$TOTAL" = "0" ]; then
    echo "   ⛔  NO HAY MESONEROS. Créalos en /dashboard/mesoneros y asígnales PIN."
else
    WAITERS=$(run 'SELECT "firstName", "lastName", "isActive", "isCaptain", pin, "branchId" FROM "Waiter" ORDER BY "isActive" DESC, "firstName" ASC')
    echo "$WAITERS" | while IFS='|' read -r fn ln active captain pin branchId; do
        [ "$active" = "t" ] && act="✅" || act="❌ inactivo"
        [ "$captain" = "t" ] && cap=" ⭐cap" || cap=""
        if [ -z "$pin" ]; then
            pin_s="🔓 sin PIN"
        elif echo "$pin" | grep -q ':'; then
            pin_s="🔒 PIN hashed (PBKDF2) ✅"
        else
            pin_s="⚠️  PIN TEXTO PLANO: \"$pin\"  ← actualizar en /dashboard/mesoneros"
        fi
        echo "   $act  $fn $ln$cap  —  $pin_s"
    done

    # Candidatos válidos
    if [ -n "$ACTIVE_BRANCH_ID" ]; then
        echo ""
        echo "   🎯 Candidatos válidos para validateWaiterPinAction en \"$ACTIVE_BRANCH_NAME\":"
        CANDS=$(run "SELECT \"firstName\", \"lastName\", \"isCaptain\", pin FROM \"Waiter\" WHERE \"branchId\" = '$ACTIVE_BRANCH_ID' AND \"isActive\" = true AND pin IS NOT NULL")
        if [ -z "$CANDS" ]; then
            echo "   ⛔  NINGUNO — la pantalla de PIN quedará vacía."
            echo "       Asigna PINs desde /dashboard/mesoneros."
        else
            echo "$CANDS" | while IFS='|' read -r fn ln captain pin; do
                echo "$pin" | grep -q ':' && fmt="PBKDF2 ✅" || fmt="PLAINTEXT ⚠️"
                [ "$captain" = "t" ] && cap=" (capitán)" || cap=""
                echo "      ✅  $fn $ln$cap  — $fmt"
            done
        fi
    fi
fi

# ── 3. Usuarios con acceso a pos_waiter ───────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────"
echo "👤 USUARIOS ACTIVOS CON ROL QUE PUEDE VER pos_waiter"

USERS=$(run "SELECT \"firstName\", \"lastName\", email, role, \"allowedModules\" FROM \"User\" WHERE role = ANY(ARRAY['OWNER','ADMIN_MANAGER','OPS_MANAGER','WAITER','CASHIER','AREA_LEAD','JEFE_AREA']) AND \"isActive\" = true ORDER BY \"firstName\" ASC")
if [ -z "$USERS" ]; then
    echo "   (ninguno)"
else
    echo "$USERS" | while IFS='|' read -r fn ln email role mods; do
        if [ -z "$mods" ]; then
            mod_s="todos (acceso por rol)"
        elif echo "$mods" | grep -q 'pos_waiter'; then
            mod_s="restringido ✅ incluye pos_waiter"
        else
            mod_s="restringido ⛔ NO incluye pos_waiter → $mods"
        fi
        echo "   $fn $ln ($role) — $email"
        echo "      módulos: $mod_s"
    done
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo ""
