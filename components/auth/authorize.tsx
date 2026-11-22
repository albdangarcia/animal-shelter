import { hasPermission } from "@/app/lib/auth/hasPermission";
import { type AppPermission } from "@/app/lib/auth/permissions";

type Props = {
  fallback: React.ReactNode;
  children: React.ReactNode;
} & (
  | { permission: AppPermission; permissions?: never }
  /** The user must hold every one of these. */
  | { permissions: readonly [AppPermission, ...AppPermission[]]; permission?: never }
);

export async function Authorize({
  permission,
  permissions,
  fallback,
  children,
}: Props) {
  const required = permissions ?? [permission];
  const held = await Promise.all(required.map((p) => hasPermission(p)));
  const isAllowed = held.every(Boolean);

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
