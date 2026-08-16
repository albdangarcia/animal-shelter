import { auth } from "@/auth";
import TopNav from "./top-nav";
import { Role } from "@/prisma/generated/enums";

const TopNavWrapper = async () => {
  const session = await auth();
  const showUserProfile = session ? true : false;

  let dashboardHref = "/dashboard";
  if (session?.user?.role === Role.USER) {
    dashboardHref = "/dashboard/my-adoption-applications"; // Specific link for regular users
  }

  // Define the navigation links dynamically
  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Pets", href: "/pets" },
    ...(session ? [{ name: "Favorites", href: "/pets/favorites" }] : []),
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
    { name: "Dashboard", href: dashboardHref },
  ];

  return (
    <TopNav
      userImage={session?.user.image}
      showUserProfile={showUserProfile}
      links={navLinks}
    />
  );
};

export default TopNavWrapper;
