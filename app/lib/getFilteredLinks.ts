import { NavDocument, NavItem } from "@/components/dashboard/nav/nav-links.config";
import { hasPermission } from "./auth/hasPermission";
import { type AppPermission } from "./auth/permissions";
import { navItemAllowed } from "./nav-item-allowed";

/**
 * True if the current user holds at least one of the given permissions.
 * Useful for showing/hiding an entry or a whole section that several disjoint
 * permissions can unlock (e.g. the Settings page and its sidebar link).
 */
export const hasAnyPermission = async (
  permissions: readonly AppPermission[]
): Promise<boolean> => {
  for (const permission of permissions) {
    if (await hasPermission(permission)) {
      return true;
    }
  }
  return false;
};

/**
 * Recursively filters navigation items based on user permissions
 * @param items Array of NavItem objects to filter
 * @returns Promise that resolves to filtered array of NavItems
 */
export const getFilteredNavLinks = async (
  items: readonly NavItem[]
): Promise<NavItem[]> => {
  const filteredLinks: NavItem[] = [];

  for (const item of items) {
    // Check if user has permission for this item
    if (!(await navItemAllowed(item, hasPermission))) {
      continue; // Skip this item if no permission
    }

    // If item has sub-items, filter those too
    if (item.items && item.items.length > 0) {
      const filteredSubItems = [];

      for (const subItem of item.items) {
        if (!subItem.permission || (await hasPermission(subItem.permission))) {
          filteredSubItems.push(subItem);
        }
      }

      // Only include parent item if it has visible sub-items or no permission-gated sub-items
      if (filteredSubItems.length > 0) {
        filteredLinks.push({
          ...item,
          items: filteredSubItems,
        });
      }
    } else {
      // No sub-items, just add the item
      filteredLinks.push(item);
    }
  }

  return filteredLinks;
};

/**
 * Filters document items based on user permissions
 * @param items Array of NavDocument objects to filter
 * @returns Promise that resolves to filtered array of NavDocuments
 */
export const getFilteredDocuments = async (
  items: readonly NavDocument[]
): Promise<NavDocument[]> => {
  const filteredDocs: NavDocument[] = [];

  for (const item of items) {
    // Check if user has permission for this item
    if (!item.permission || (await hasPermission(item.permission))) {
      filteredDocs.push(item);
    }
  }

  return filteredDocs;
};
