import { PrismaClient } from "@/prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { resolveDatabaseUrl } from "@/app/lib/db-url";
import { phoneNormalizationExtension } from "@/app/lib/prisma-extensions/phone-normalization";

const connectionString = resolveDatabaseUrl("pooled");

const prismaClientSingleton = () => {
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter }).$extends(phoneNormalizationExtension);
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

// The extension changes $transaction's callback-argument type relative to
// Prisma.TransactionClient (which is derived from the unextended client), so
// helpers that take a `tx` param outside the callback must use this instead.
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}