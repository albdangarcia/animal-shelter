import { Permissions, type Permission } from "@/app/lib/auth/permissions";

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
  permission?: Permission;
  isActive?: boolean;
  items?: Array<{
    title: string;
    url: string;
    permission?: Permission;
  }>;
}

export interface NavDocument {
  name: string;
  url: string;
  icon: IconName;
  permission?: Permission;
}

// Main navigation items
export const navMainItems: readonly NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: "IconDashboard",
    permission: Permissions.ANIMAL_READ_ANALYTICS,
  },
  {
    title: "Animals",
    url: "/dashboard/animals",
    icon: "IconListDetails",
    permission: Permissions.ANIMAL_READ_LISTING,
  },
  {
    title: "Role Management",
    url: "/dashboard/role-management",
    icon: "IconChartBar",
    permission: Permissions.MANAGE_ROLES,
  },
  {
    title: "People Directory",
    url: "/dashboard/people-directory",
    icon: "IconUsersGroup",
    permission: Permissions.PERSONS_READ_LISTING,
  },
  {
    title: "My Applications",
    url: "/dashboard/my-applications",
    icon: "IconFileText",
    permission: Permissions.MY_APPLICATIONS_READ,
  },
  {
    title: "Adoption Applications",
    url: "/dashboard/adoption-applications",
    icon: "IconHeartHandshake",
    permission: Permissions.APPLICATIONS_READ_LISTING,
  },
  {
    title: "Outcomes",
    url: "/dashboard/outcomes",
    icon: "IconChecks",
    permission: Permissions.OUTCOMES_MANAGE,
  },
  {
    title: "Animal Tasks",
    url: "/dashboard/animal-tasks",
    icon: "IconCheckbox",
    permission: Permissions.ANIMAL_TASK_READ_LISTING,
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
