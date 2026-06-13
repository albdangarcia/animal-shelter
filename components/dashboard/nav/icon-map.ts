import {
  IconDashboard,
  IconListDetails,
  IconUsers,
  IconFolder,
  IconClipboardList,
  IconCamera,
  IconFileDescription,
  IconFileAi,
  IconSettings,
  IconHelp,
  IconSearch,
  IconReport,
  IconFileWord,
  IconCirclePlus,
  IconChartBar,
  IconUsersGroup,
  IconHeartHandshake,
  IconFileText,
  IconChecks,
  IconCheckbox,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { IconName } from "./nav-links.config";

export const iconMap: Record<IconName, TablerIcon> = {
  IconDashboard,
  IconListDetails,
  IconUsers,
  IconFolder,
  IconClipboardList,
  IconCamera,
  IconFileDescription,
  IconFileAi,
  IconSettings,
  IconHelp,
  IconSearch,
  IconReport,
  IconFileWord,
  IconCirclePlus,
  IconChartBar,
  IconUsersGroup,
  IconHeartHandshake,
  IconFileText,
  IconChecks,
  IconCheckbox,
};

// Helper function to get icon component from string name
export function getIcon(iconName: IconName): TablerIcon {
  return iconMap[iconName];
}
