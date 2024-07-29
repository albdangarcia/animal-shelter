"use client";
import { updateUser, CreateUserFormState } from "@/app/lib/actions/user";
import { useFormState } from "react-dom";
import Link from "next/link";

interface userWithRole {
  id: string;
  email: string;
  role: string;
}

export default function EditUserForm({ user }: { user: userWithRole }) {
  const updateUserWithId = updateUser.bind(null, user.id);
  const initialState = { message: null, errors: {} };
  const [state, dispatch] = useFormState<CreateUserFormState, FormData>(
    updateUserWithId,
    initialState
  );

  return (
    <form action={dispatch}>
      <div>
        <div className="border-b border-gray-900/10 pb-5">
          <div className="mt-5 grid grid-cols-1 gap-y-4">
            <div>
              <span className="text-sm font-medium leading-6">Email</span>
              <div className="mt-1 font-medium">{user.email}</div>
            </div>

            <div>
              <label
                htmlFor="role"
                className="block text-sm font-medium leading-6 text-gray-900"
              >
                Role
              </label>
              <div className="mt-2">
                <select
                  id="role"
                  name="role"
                  defaultValue={user.role}
                  autoComplete="off"
                  aria-describedby="role-error"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 sm:max-w-xs sm:text-sm sm:leading-6 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                >
                  <option value="user">User</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
              <div id="role-error" aria-live="polite" aria-atomic="true">
                {state.errors?.role &&
                  state.errors.role.map((error: string) => (
                    <p className="mt-2 text-sm text-red-500" key={error}>
                      {error}
                    </p>
                  ))}
              </div>
            </div>
          </div>

          {/* form errors */}
          <div id="users-error" aria-live="polite" aria-atomic="true">
            {state.message && (
              <p className="mt-2 text-sm text-red-500" key={state.message}>
                {state.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-x-6">
        <Link
          href="/dashboard/users"
          type="button"
          className="text-sm font-semibold leading-6 text-gray-900"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Save
        </button>
      </div>
    </form>
  );
}
