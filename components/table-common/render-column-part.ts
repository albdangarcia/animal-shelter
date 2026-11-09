import type { ComponentClass, ReactNode } from "react";
import { flexRender, type Renderable } from "@tanstack/react-table";

/**
 * flexRender for a column's header or cell, without remounting it.
 *
 * flexRender mounts a function as a component. Columns built by getColumns
 * get new functions on every render, so each re-render of the table (the
 * refresh after a save, say) would remount every cell: a row's menu and the
 * dialog it opened are thrown away, with their state and focus. Calling the
 * function instead keeps the element it returns, whose type does not change.
 * A header or cell function must therefore not call hooks itself; it renders
 * a component that does.
 */
export function renderColumnPart<TProps extends object>(
  part: Renderable<TProps>,
  props: TProps,
): ReactNode {
  if (
    typeof part === "function" &&
    !(part as ComponentClass<TProps>).prototype?.isReactComponent
  ) {
    return (part as (props: TProps) => ReactNode)(props);
  }
  return flexRender(part, props);
}
