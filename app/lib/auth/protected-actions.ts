import { hasPermission } from "./hasPermission";
import { auth } from "@/auth";
import { type Session } from "next-auth";
import { type Permission } from "./permissions";

export type SessionUser = Session["user"];

/**
 * A HOF that protects an action by ensuring the user is authenticated.
 * It passes the precise SessionUser object to the wrapped action.
 */
export function withAuthenticatedUser<TArgs extends unknown[], TReturn>(
  action: (user: SessionUser, ...args: TArgs) => Promise<TReturn>,
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const session = await auth();
    if (!session?.user) {
      throw new Error(
        "Access Denied. You must be logged in to perform this action.",
      );
    }
    return action(session.user, ...args);
  };
}

/**
 * A decorator-style function for protecting server actions with permission-based checks.
 * @param requiredPermission The permission required to execute the action.
 * @returns A function that takes the target action and returns a new, protected version of it.
 */
export function RequirePermission(requiredPermission: Permission) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function <T extends (...args: any[]) => Promise<any>>(target: T): T {
    const protectedAction = async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const isAllowed = await hasPermission(requiredPermission);
      if (!isAllowed) {
        throw new Error(
          "Access Denied. You do not have permission to perform this action."
        );
      }
      return target(...args) as unknown as ReturnType<T>;
    };
    return protectedAction as T;
  };
}