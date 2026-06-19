import { NextResponse } from "next/server";
import { main } from "@/prisma/seed";
import { isDemo } from "@/lib/flags";
import {prisma} from "@/app/lib/prisma";

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
    console.log("Starting demo database reset...");

    // Delete deep relation/junction records & logs first
    await prisma.animalActivityLog.deleteMany({});
    await prisma.templateField.deleteMany({});
    await prisma.medicalRecord.deleteMany({});
    await prisma.animalNote.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.assessment.deleteMany({});
    
    // Delete operational records that link animals, people, and templates
    await prisma.outcome.deleteMany({});
    await prisma.intake.deleteMany({});
    await prisma.animalImage.deleteMany({});
    await prisma.assessmentTemplate.deleteMany({});

    // Delete core entities that were referenced by the operational records above
    await prisma.user.deleteMany({});
    await prisma.person.deleteMany({});
    await prisma.animal.deleteMany({});
    await prisma.partner.deleteMany({});

    // Delete master configuration/lookup tables last
    await prisma.characteristic.deleteMany({});
    await prisma.color.deleteMany({});
    await prisma.breed.deleteMany({});
    await prisma.species.deleteMany({});

    console.log("Database wiped.");

    // Run full seeding logic
    console.log("Seeding new data...");
    await main();
    console.log("Database has been successfully re-seeded.");

    return NextResponse.json({
      success: true,
      message: "Demo database reset successfully.",
    });
  } catch (error) {
    // Log the detailed error on the server
    console.error("Failed to reset demo database:", error);
    // Return a generic error message to the client
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}