import { hasPermission } from "@/app/lib/auth/hasPermission";
import { type Permission } from "@/app/lib/auth/permissions";

interface Props {
  permission: Permission;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

export async function Authorize({ permission, fallback, children }: Props) {
  const isAllowed = await hasPermission(permission);

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
