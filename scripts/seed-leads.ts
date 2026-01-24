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

  // 2. Get a user for createdBy (to avoid foreign key errors)
  const user = await prisma.user.findFirst({
    where: { companyId: company.id },
  });
  const userId = user ? user.id : 1;

  // 3. Find or Create the TableMeta
  let table = await prisma.tableMeta.findUnique({
    where: {
      companyId_slug: {
        companyId: company.id,
        slug: TABLE_SLUG,
      },
    },
  });

  if (!table) {
    console.log(`Table "${TABLE_SLUG}" not found. Creating it...`);

    // Define schema
    const schema = [
      { name: "leadName", label: "שם הליד", type: "text" },
      { name: "phoneNumber", label: "טלפון", type: "text" },
      { name: "source", label: "מקור", type: "select", options: SOURCES },
      { name: "status", label: "סטטוס", type: "select", options: STATUSES },
      { name: "budget", label: "תקציב", type: "number" },
      { name: "email", label: "אימייל", type: "text" },
    ];

    try {
      table = await prisma.tableMeta.create({
        data: {
          name: "לידים",
          slug: TABLE_SLUG,
          schemaJson: schema,
          companyId: company.id,
          createdBy: userId,
        },
      });
      console.log(`Created table: ${table.name} (ID: ${table.id})`);
    } catch (createError) {
      console.error("Error creating table:", createError);
      process.exit(1);
    }
  } else {
    console.log(`Found table: ${table.name} (ID: ${table.id})`);
  }

  // 4. Generate Records
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
      leadName: fullName,
      phoneNumber: generatePhoneNumber(),
      source: getRandomElement(SOURCES),
      status: getRandomElement(STATUSES),
      budget: getRandomInt(1000, 50000),
      email: email,
    };

    recordsData.push({
      companyId: company.id,
      tableId: table.id,
      data: recordData,
      createdBy: userId,
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
