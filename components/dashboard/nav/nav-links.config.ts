import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";

export type IconName =
  | "IconDashboard"
  | "IconListDetails"
  | "IconUsers"
  | "IconFolder"
  | "IconClipboardList"
  | "IconCamera"
  | "IconFileDescription"
  | "IconFileAi"
  | "IconSettings"
  | "IconHelp"
  | "IconSearch"
  | "IconReport"
  | "IconFileWord"
  | "IconCirclePlus"
  | "IconFolder"
  | "IconChartBar"
  | "IconDashboard"
  | "IconListDetails"
  | "IconUsers"
  | "IconUsersGroup"
  | "IconHeartHandshake"
  | "IconFileText"
  | "IconChecks"
  | "IconCheckbox"
  | "IconBuildingStore"
  | "IconLayoutBoard"
  | "IconHomeHeart"
  | "IconClipboardHeart"
  | "IconDog"

export interface NavItem {
  title: string;
  url: string;
  icon: IconName;
  /**
   * Single required permission. Mutually exclusive with `anyPermissions` —
   * if both are set, `anyPermissions` wins (see `getFilteredNavLinks`).
   */
  permission?: AppPermission;
  /**
   * Show the entry when the user holds ANY of these. Added for Settings, which
   * is reachable by several disjoint permissions (each settings card gates
   * itself); a single `permission` can't express "role-manager OR ai-activity
   * reader OR …". Every other entry uses the single `permission` form.
   */
  anyPermissions?: readonly AppPermission[];
  isActive?: boolean;
  items?: Array<{
    title: string;
    url: string;
    permission?: AppPermission;
  }>;
}

/**
 * Every permission that unlocks at least one card on the Settings page. The
 * single source of truth for "can this user reach Settings at all" — used both
 * by the sidebar entry below (`anyPermissions`) and by the page's own top-level
 * gate (`app/dashboard/settings/page.tsx`), so the two can't drift.
 *
 * Keep in sync with `settingsCards` on the settings page: adding a card with a
 * new permission means adding it here too, or staff granted only that
 * permission would reach the page with no way to navigate to it.
 */
export const SETTINGS_PERMISSIONS: readonly AppPermission[] = [
  AppPermissions.MANAGE_ROLES,
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
  AppPermissions.MANAGE_ASSESSMENT_TEMPLATES,
  AppPermissions.MANAGE_LOCATIONS,
  AppPermissions.AI_ACTIVITY_READ,
] as const;

export interface NavDocument {
  name: string;
  url: string;
  icon: IconName;
  permission?: AppPermission;
}

// Main navigation items
export const navMainItems: readonly NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: "IconDashboard",
    permission: AppPermissions.ANIMAL_READ_ANALYTICS,
  },
  {
    title: "Animals",
    url: "/dashboard/animals",
    icon: "IconListDetails",
    permission: AppPermissions.ANIMAL_INFO_READ,
  },
  {
    title: "People Directory",
    url: "/dashboard/people-directory",
    icon: "IconUsersGroup",
    permission: AppPermissions.PERSONS_READ,
  },
  {
    title: "Partner Directory",
    url: "/dashboard/partners-directory",
    icon: "IconBuildingStore",
    permission: AppPermissions.PARTNERS_READ,
  },
  {
    title: "My Adoption Applications",
    url: "/dashboard/my-adoption-applications",
    icon: "IconFileText",
    permission: AppPermissions.MY_APPLICATIONS_READ,
  },
  {
    title: "My Foster Application",
    url: "/dashboard/my-foster-application",
    icon: "IconClipboardHeart",
    permission: AppPermissions.MY_FOSTER_APPLICATION_MANAGE,
  },
  {
    title: "My Foster Animals",
    url: "/dashboard/my-foster-animals",
    icon: "IconDog",
    permission: AppPermissions.MY_FOSTER_ANIMALS_READ,
  },
  {
    title: "Adoption Applications",
    url: "/dashboard/adoption-applications",
    icon: "IconHeartHandshake",
    permission: AppPermissions.APPLICATIONS_READ,
  },
  {
    title: "Fosters",
    url: "/dashboard/fosters",
    icon: "IconHomeHeart",
    permission: AppPermissions.FOSTERS_READ,
  },
  {
    title: "Foster Applications",
    url: "/dashboard/foster-applications",
    icon: "IconClipboardList",
    permission: AppPermissions.FOSTERS_READ,
  },
  {
    title: "Outcomes",
    url: "/dashboard/outcomes",
    icon: "IconChecks",
    permission: AppPermissions.OUTCOMES_READ,
  },
  {
    title: "Reports",
    url: "/dashboard/reports",
    icon: "IconReport",
    permission: AppPermissions.REPORTS_READ,
  },
  {
    title: "Animal Tasks",
    url: "/dashboard/animal-tasks",
    icon: "IconCheckbox",
    permission: AppPermissions.ANIMAL_TASK_READ,
  },
  {
    title: "Housing Board",
    url: "/dashboard/locations",
    icon: "IconLayoutBoard",
    permission: AppPermissions.ANIMAL_INFO_READ,
  },
  {
    title: "AI Assistant",
    url: "/dashboard/ai-chat",
    icon: "IconFileAi",
    permission: AppPermissions.AI_CHAT_USE,
  },
] as const;

// Navigation with collapsible sub-items
export const navCollapsibleItems: readonly NavItem[] = [
  {
    title: "Capture",
    icon: "IconCamera",
    isActive: true,
    url: "#",
    items: [
      {
        title: "Active Proposals",
        url: "#",
      },
      {
        title: "Archived",
        url: "#",
      },
    ],
  },
  {
    title: "Proposal",
    icon: "IconFileDescription",
    url: "#",
    items: [
      {
        title: "Active Proposals",
        url: "#",
      },
      {
        title: "Archived",
        url: "#",
      },
    ],
  },
] as const;

// Secondary navigation items
export const navSecondaryItems: readonly NavItem[] = [
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: "IconSettings",
    anyPermissions: SETTINGS_PERMISSIONS,
  },
  {
    title: "Get Help",
    url: "#",
    icon: "IconHelp",
  },
  {
    title: "Search",
    url: "#",
    icon: "IconSearch",
  },
] as const;

// Documents/Quick actions
export const documentItems: readonly NavDocument[] = [] as const;