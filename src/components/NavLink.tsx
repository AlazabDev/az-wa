import { Link } from "@tanstack/react-router";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<React.ComponentPropsWithoutRef<"a">, "href"> {
  to: string;
  end?: boolean;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  (
    { className, activeClassName, pendingClassName: _pendingClassName, to, end, target, ...props },
    ref,
  ) => {
    return (
      <Link
        ref={ref}
        to={to}
        activeOptions={{ exact: end ?? false }}
        className={cn(className)}
        activeProps={{ className: cn(className, activeClassName) }}
        {...props}
        {...(target !== undefined ? { target } : {})}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
