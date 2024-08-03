import { fetchFilteredUsers } from "@/app/lib/data/users/user";
import { PhotoIcon } from "@heroicons/react/24/solid";
import { DeleteUser, EditUser } from "./buttons";

export default async function UsersTable({
  query,
  currentPage,
}: {
  query: string;
  currentPage: number;
}) {
  const users = await fetchFilteredUsers(query, currentPage);

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-md shadow-sm pb-4 pt-1">
      {/* table headers */}
      <div className="hidden border-b text-sm font-medium sm:grid grid-cols-4 gap-4 px-6 py-4 rounded-t-md">
        <div className="text-nowrap col-span-2">Email</div>
        <div className="text-nowrap">Role</div>
        <div className="text-nowrap text-center">Edit</div>
      </div>

      {/* table contents */}
      <div className="text-sm [&>div:not(:last-child)]:border-b">
        {users?.map((user) => (
          <div
            key={user.id}
            className="grid items-center grid-cols-4 gap-y-0 gap-4 py-4 px-6 sm:py-2 text-gray-900 hover:bg-gray-100/50"
          >
            <div className="col-span-4 sm:col-span-2">
              <div className="flex items-center space-x-2">
                {/* Flex container */}
                <div className="flex-shrink-0">
                  {/* Prevent the image from shrinking */}
                  {user.image ? (
                    <img
                      src={user.image}
                      className="rounded-full"
                      width={28}
                      height={28}
                      alt={`${user.email} profile picture`}
                    />
                  ) : (
                    <PhotoIcon className="w-7 text-gray-400" />
                  )}
                </div>
                <div className="truncate font-medium sm:font-normal">
                  {user.email}
                </div>
              </div>
            </div>
            <div className="truncate text-gray-500 sm:text-inherit capitalize">
              {user.role}
            </div>
            <div className="flex justify-end sm:justify-center gap-3 col-span-3 sm:col-span-1">
              <EditUser id={user.id} />
              <DeleteUser id={user.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
