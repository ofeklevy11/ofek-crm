import { prisma } from "../lib/prisma";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configuration
const TABLE_SLUG = "leads-table"; // Replace if your table slug is different
const RECORD_COUNT = 50;

// Data Options
const SOURCES = ["Google", "Facebook", "LinkedIn", "Referral", "Other"];
const STATUSES = ["חדש", "בתהליך", "סגור", "לא רלוונטי"];

// Dummy Data Arrays
const FIRST_NAMES = [
  "Yossi",
  "Sarah",
  "David",
  "Rina",
  "Moshe",
  "Avraham",
  "Rachel",
  "Daniel",
  "Noa",
  "Omer",
  "Itay",
  "Maya",
  "Gal",
  "Tamar",
  "Ido",
  "Adi",
  "Guy",
  "Shira",
  "Eyal",
  "Dana",
  "Ben",
  "Liat",
  "Ron",
  "Michal",
  "Dor",
  "Hila",
  "Yair",
  "Neta",
  "Asaf",
  "Keren",
];
const LAST_NAMES = [
  "Cohen",
  "Levi",
  "Mizrahi",
  "Golan",
  "Katz",
  "Peretz",
  "Friedman",
  "Biton",
  "Tal",
  "Dahan",
  "Azulai",
  "Gabai",
  "Shalom",
  "Hadad",
  "Ezra",
  "Goldstein",
  "Shapira",
  "Bar",
  "Navon",
  "Sasson",
  "Ohana",
  "Edri",
  "Klein",
  "Segal",
  "Barak",
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhoneNumber() {
  const prefix = "05" + getRandomInt(0, 9);
  const rest = getRandomInt(1000000, 9999999).toString();
  return `${prefix}-${rest}`;
}

async function main() {
  console.log(`Starting seed script for table: ${TABLE_SLUG}...`);

  // 1. Get the first company (default context)
  const company = await prisma.company.findFirst();
  if (!company) {
    throw new Error(
      "No company found in the database. Please create a company first.",
    );
  }
  console.log(`Using company: ${company.name} (ID: ${company.id})`);

  // 2. Find the TableMeta
  const table = await prisma.tableMeta.findUnique({
    where: {
      companyId_slug: {
        companyId: company.id,
        slug: TABLE_SLUG,
      },
    },
  });

  if (!table) {
    console.error(
      `Error: Table with slug "${TABLE_SLUG}" not found for company "${company.name}".`,
    );
    console.log("Available tables:");
    const tables = await prisma.tableMeta.findMany({
      where: { companyId: company.id },
      select: { slug: true, name: true },
    });
    tables.forEach((t) => console.log(`- ${t.name} (slug: ${t.slug})`));
    process.exit(1);
  }

  console.log(`Found table: ${table.name} (ID: ${table.id})`);

  // 3. Generate Records
  const recordsData = [];
  for (let i = 0; i < RECORD_COUNT; i++) {
    const firstName = getRandomElement(FIRST_NAMES);
    const lastName = getRandomElement(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;

    // Email generation
    const emailDomain = getRandomElement([
      "gmail.com",
      "yahoo.com",
      "outlook.com",
      "walla.co.il",
      "hotmail.com",
    ]);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${getRandomInt(1, 99)}@${emailDomain}`;

    const recordData = {
      leadName: fullName, // Assuming 'leadName' is the column key
      phoneNumber: generatePhoneNumber(),
      source: getRandomElement(SOURCES),
      status: getRandomElement(STATUSES),
      budget: getRandomInt(1000, 50000), // Variable budget
      email: email,
    };

    recordsData.push({
      companyId: company.id,
      tableId: table.id,
      data: recordData,
      createdBy: 1, // Assuming admin/system user ID 1 exists
    });
  }

  // 4. Insert Records
  console.log(`Inserting ${RECORD_COUNT} records...`);

  try {
    const result = await prisma.record.createMany({
      data: recordsData,
    });
    console.log(
      `Successfully inserted ${result.count} records into "${table.name}".`,
    );
  } catch (error) {
    console.error("Error inserting records:", error);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
