import Link from "next/link";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import { hasAnyPermission } from "@/app/lib/getFilteredLinks";
import { SETTINGS_PERMISSIONS } from "@/components/dashboard/nav/nav-links.config";

interface SettingsCard {
    title: string;
    description: string;
    url: string;
    permission: AppPermission;
}

// Keep the permissions here in sync with SETTINGS_PERMISSIONS (nav-links.config)
// — that list gates both this page and its sidebar entry.
const settingsCards: readonly SettingsCard[] = [
    {
        title: "Role Management",
        description: "Manage user roles and permissions across the shelter.",
        url: "/dashboard/settings/role-management",
        permission: AppPermissions.MANAGE_ROLES,
    },
    {
        title: "Characteristics",
        description:
            "Manage the catalog of tags used to describe animals, like behavioral, medical, and environmental traits.",
        url: "/dashboard/settings/characteristics",
        permission: AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
    },
    {
        title: "Animal Taxonomy",
        description:
            "Manage species, breeds, and colors used to describe animals.",
        url: "/dashboard/settings/animal-taxonomy",
        permission: AppPermissions.MANAGE_ANIMAL_TAXONOMY,
    },
    {
        title: "Locations",
        description:
            "Manage kennel locations and the units within each one.",
        url: "/dashboard/settings/locations",
        permission: AppPermissions.MANAGE_LOCATIONS,
    },
    {
        title: "AI Activity",
        description:
            "Review changes the assistant made to shelter data, and undo them.",
        url: "/dashboard/settings/ai-activity",
        permission: AppPermissions.AI_ACTIVITY_READ,
    },
] as const;

const Page = async () => {
    // Settings is no longer admin-only: an any-of check over the settings
    // catalog permissions, as the previous comment here anticipated. The
    // per-card <Authorize> blocks below still hide the cards a user can't use,
    // so a staff member with only AI_ACTIVITY_READ sees just that one.
    const allowed = await hasAnyPermission(SETTINGS_PERMISSIONS);

    if (!allowed) {
        return <PageNotFoundOrAccessDenied type="accessDenied" />;
    }

    return <PageContent />;
};

const PageContent = async () => {
    return (
        <Card className="@container/card">
            <CardHeader>
                <CardTitle className="@[650px]/card:text-xl">Settings</CardTitle>
                <CardDescription>
                    Configure system-wide options for your shelter.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {settingsCards.map((card) => (
                        <Authorize
                            key={card.url}
                            permission={card.permission}
                            fallback={null}
                        >
                            <Link href={card.url} className="group">
                                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/50">
                                    <CardHeader>
                                        <CardTitle className="text-base">{card.title}</CardTitle>
                                        <CardDescription>{card.description}</CardDescription>
                                    </CardHeader>
                                </Card>
                            </Link>
                        </Authorize>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default Page;
