import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("Seeding database…");

  const passwordHash = await bcrypt.hash("password123", 12);

  const users = [
    { email: "ceo@digitalmojo.in", name: "CEO", role: "CEO" as const },
    { email: "hr@digitalmojo.in", name: "HR Manager", role: "HR" as const },
    { email: "manager@digitalmojo.in", name: "Team Manager", role: "MANAGER" as const },
    { email: "employee@digitalmojo.in", name: "Team Member", role: "EMPLOYEE" as const },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
    console.log(`  User: ${user.email} (${user.role})`);
  }

  console.log("Done. Default password: password123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
