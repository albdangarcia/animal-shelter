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

export interface NavItem {
  title: string;
  url: string;
  icon: IconName;
  permission?: AppPermission;
  isActive?: boolean;
  items?: Array<{
    title: string;
    url: string;
    permission?: AppPermission;
  }>;
}

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
    title: "Role Management",
    url: "/dashboard/role-management",
    icon: "IconChartBar",
    permission: AppPermissions.MANAGE_ROLES,
  },
  {
    title: "People Directory",
    url: "/dashboard/people-directory",
    icon: "IconUsersGroup",
    permission: AppPermissions.PERSONS_READ,
  },
  {
    title: "My Applications",
    url: "/dashboard/my-applications",
    icon: "IconFileText",
    permission: AppPermissions.MY_APPLICATIONS_READ,
  },
  {
    title: "Adoption Applications",
    url: "/dashboard/adoption-applications",
    icon: "IconHeartHandshake",
    permission: AppPermissions.APPLICATIONS_READ,
  },
  {
    title: "Outcomes",
    url: "/dashboard/outcomes",
    icon: "IconChecks",
    permission: AppPermissions.OUTCOMES_READ,
  },
  {
    title: "Animal Tasks",
    url: "/dashboard/animal-tasks",
    icon: "IconCheckbox",
    permission: AppPermissions.ANIMAL_TASK_READ,
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
    url: "#",
    icon: "IconSettings",
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
export const documentItems: readonly NavDocument[] = [
  {
    name: "Reports",
    url: "#",
    icon: "IconReport",
  },
] as const;