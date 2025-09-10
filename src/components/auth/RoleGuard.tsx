// src/components/auth/RoleGuard.tsx
import { useAuth } from "../../hooks/useAuth";

interface RoleGuardProps {
  roles: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGuard({
  roles,
  fallback = null,
  children,
}: RoleGuardProps) {
  const { hasRole } = useAuth();

  if (!hasRole(roles)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Permission-based guard
interface PermissionGuardProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({
  permission,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Specific role guards for your system
export function MasterOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard roles="MASTER" fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export function FullAccessOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard
      roles={["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"]}
      fallback={fallback}
    >
      {children}
    </RoleGuard>
  );
}

export function FinanceOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard roles={["MASTER", "FINANCE"]} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

// Access-specific guards
export function InvoiceAccess({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { canAccessInvoices } = useAuth();

  if (!canAccessInvoices) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export function InvoiceEditAccess({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { canEditInvoices } = useAuth();

  if (!canEditInvoices) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Work Order access guards
export function WorkOrderEditAccess({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { canEditWorkOrders } = useAuth();

  if (!canEditWorkOrders) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Read-only wrapper for Finance users on non-invoice sections
export function ReadOnlyForFinance({
  children,
  readOnlyComponent,
}: {
  children: React.ReactNode;
  readOnlyComponent: React.ReactNode;
}) {
  const { isFinance, isMaster } = useAuth();

  // If Finance role (but not Master), show read-only version
  if (isFinance && !isMaster) {
    return <>{readOnlyComponent}</>;
  }

  // Otherwise show full access
  return <>{children}</>;
}
