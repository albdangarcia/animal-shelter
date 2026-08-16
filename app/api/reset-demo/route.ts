import { NextResponse } from "next/server";
import { main } from "@/prisma/seed";
import { isDemo } from "@/lib/flags";
import prisma from "@/app/lib/prisma";

export async function GET(request: Request) {
  // Hard exit if not a demo environment
  if (!isDemo) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  
  // Protect the endpoint with a secret key
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("Starting demo database reset via seed script...");
    await main();
    console.log("Database has been successfully cleared and re-seeded.");

    return NextResponse.json({
      success: true,
      message: "Demo database reset successfully.",
    });
  } catch (error) {
    console.error("Failed to reset demo database:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}