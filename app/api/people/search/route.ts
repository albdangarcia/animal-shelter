import { NextResponse } from "next/server";
import { getCachedSession } from "@/app/lib/auth/session";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchPeopleForPicker } from "@/app/lib/data/people-directory/people-directory.data";

export async function GET(request: Request) {
  const session = await getCachedSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized: You must be logged in." },
      { status: 401 },
    );
  }

  const isAuthorized = await hasPermission(AppPermissions.PERSONS_READ);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to search people." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";

  try {
    const people = await fetchPeopleForPicker(query);
    return NextResponse.json(people);
  } catch (error) {
    console.error("Error searching people for picker:", error);
    return NextResponse.json(
      { error: "Failed to search people." },
      { status: 500 },
    );
  }
}
