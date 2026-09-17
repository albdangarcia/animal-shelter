import {
  IconDashboard,
  IconListDetails,
  IconUsers,
  IconFolder,
  IconClipboardList,
  IconFileAi,
  IconSettings,
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
  IconBuildingStore,
  IconLayoutBoard,
  IconHomeHeart,
  IconClipboardHeart,
  IconDog,
  IconClipboardCheck,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { IconName } from "./nav-links.config";

export const iconMap: Record<IconName, TablerIcon> = {
  IconDashboard,
  IconListDetails,
  IconUsers,
  IconFolder,
  IconClipboardList,
  IconFileAi,
  IconSettings,
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
  IconBuildingStore,
  IconLayoutBoard,
  IconHomeHeart,
  IconClipboardHeart,
  IconDog,
  IconClipboardCheck,
};

// Helper function to get icon component from string name
export function getIcon(iconName: IconName): TablerIcon {
  return iconMap[iconName];
}
