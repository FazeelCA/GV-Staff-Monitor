import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Initialize Prisma Client
function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

async function main() {
    console.log("Creating Admin User...");
    const email = "fazeel@gallery.vision"; // Fallback to fazeel@galleryvision if this isn't right
    const password = "264378";
    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const user = await prisma.user.upsert({
            where: { email },
            update: {
                passwordHash,
                role: "ADMIN"
            },
            create: {
                email,
                name: "Fazeel Admin",
                passwordHash,
                role: "ADMIN"
            }
        });

        const user2 = await prisma.user.upsert({
            where: { email: "fazeel@galleryvision" },
            update: {
                passwordHash,
                role: "ADMIN"
            },
            create: {
                email: "fazeel@galleryvision",
                name: "Fazeel Admin 2",
                passwordHash,
                role: "ADMIN"
            }
        });

        console.log(`Successfully created/updated admin users:`);
        console.log(`- ${user.email} (Role: ${user.role})`);
        console.log(`- ${user2.email} (Role: ${user2.role})`);
        console.log(`Password set to: ${password}`);

    } catch (e) {
        console.error("Error creating user:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
