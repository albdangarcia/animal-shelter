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

interface SettingsCard {
    title: string;
    description: string;
    url: string;
    permission: AppPermission;
}

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
        title: "Assessment Templates",
        description:
            "Create and edit the templates staff use to assess animals.",
        url: "/dashboard/settings/assessment-templates",
        permission: AppPermissions.MANAGE_ASSESSMENT_TEMPLATES,
    },
] as const;

const Page = async () => {
    return (
        // NOTE: settings is admin-only for now, so MANAGE_ROLES acts as the gate.
        // If a non-admin role is ever granted a settings catalog permission,
        // switch this to an any-of check over the settings permissions.
        <Authorize
            permission={AppPermissions.MANAGE_ROLES}
            fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
        >
            <PageContent />
        </Authorize>
    );
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