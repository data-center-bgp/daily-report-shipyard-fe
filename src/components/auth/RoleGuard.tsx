import { useAuth } from "../../hooks/useAuth";

interface RoleGuardProps {
  children: React.ReactNode;
  roles?: string | string[];
  feature?: string;
  fallback?: React.ReactNode;
}

export function RoleGuard({
  children,
  roles,
  feature,
  fallback = <div className="p-4 text-center text-gray-500">Access Denied</div>,
}: RoleGuardProps) {
  const { loading, hasRole, canAccess } = useAuth();

  // Always show loading state first
  if (loading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  // Check access by feature or role
  const hasAccess = feature
    ? canAccess(feature)
    : roles
    ? hasRole(roles)
    : true;

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Pre-made role guards for common use cases
export const MasterOnly = ({ children }: { children: React.ReactNode }) => (
  <RoleGuard roles={["MASTER", "MANAGER"]} children={children} />
);

export const FinanceAccess = ({ children }: { children: React.ReactNode }) => (
  <RoleGuard roles={["MASTER", "MANAGER", "FINANCE"]} children={children} />
);

export const OperationsAccess = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <RoleGuard
    roles={["MASTER", "MANAGER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"]}
    children={children}
  />
);
