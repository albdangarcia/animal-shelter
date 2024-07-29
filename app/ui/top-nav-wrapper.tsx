import { auth } from "@/auth";
import TopNav from "./top-nav";

export default async function TopNavWrapper() {
  const session = await auth();
  const showUserProfile = session ? true : false;
  return (
    <TopNav userImage={session?.user.image} showUserProfile={showUserProfile} />
  )
}
