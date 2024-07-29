import { auth } from "@/auth";

// Check if the user has permission to perform an action
export const rolesWithPermission = async (allowedRoles: string[]) => {
    // Get the current session
    const session = await auth();
    // If the session is not found, return false
    if (!session) {
      return false;
    }
    // Get the role of the current user
    const userRole = session?.user?.role;
    // If the user role is not in the allowed roles, return false
    return allowedRoles.includes(userRole);
  };