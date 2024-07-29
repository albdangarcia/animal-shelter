import Breadcrumbs from "@/app/ui/dashboard/pets/breadcrumbs";
import {
  fetchUserById,
} from "@/app/lib/data/users/user";
import { notFound } from "next/navigation";
import EditUserForm from "@/app/ui/dashboard/users/edit-form";

export default async function Page({ params }: { params: { id: string } }) {
  // get the id from the url
  const id = params.id;

  // fetch user from database
  const user = await fetchUserById(id);

  // if the pet is not found then return not found page
  if (!user) {
    notFound();
  }

  return (
    <main>
      <Breadcrumbs
        breadcrumbs={[
          { label: "Users", href: "/dashboard/user" },
          {
            label: "Edit User",
            href: `/dashboard/users/${id}/edit`,
            active: true,
          },
        ]}
      />
      <h2 className="text-base font-semibold leading-7 text-gray-900">
        User Role
      </h2>

      <EditUserForm user={user} />
    </main>
  );
}
