import { prisma } from "../lib/prisma";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configuration
const LEADS_TABLE_SLUG = "leads-table";
const LEADS_COUNT = 50;
const CLIENTS_COUNT = 20;

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

const COMPANY_NAMES = [
  "Tech Solutions Ltd",
  "Creative Minds",
  "Global Trading",
  "Smart Systems",
  "Green Energy",
  "Alpha Beta",
  "Omega Corp",
  "Prime Holdings",
  "Elite Services",
  "Dynamic Group",
  "Future Vision",
  "Next Gen",
  "Blue Sky",
  "Red Rock",
  "Silver Lining",
  "Golden Gate",
  "Iron Works",
  "Steel Struct",
  "Cloud Nine",
  "Deep Blue",
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

async function seedLeads(companyId: number, userId: number) {
  console.log(`\n--- Seeding Leads Table ---`);

  // Find or Create the TableMeta
  let table = await prisma.tableMeta.findUnique({
    where: {
      companyId_slug: {
        companyId: companyId,
        slug: LEADS_TABLE_SLUG,
      },
    },
  });

  if (!table) {
    console.log(`Table "${LEADS_TABLE_SLUG}" not found. Creating it...`);

    // Define schema
    const schema = [
      { name: "leadName", label: "שם הליד", type: "text" },
      { name: "phoneNumber", label: "טלפון", type: "phone" },
      { name: "source", label: "מקור", type: "select", options: SOURCES },
      { name: "status", label: "סטטוס", type: "select", options: STATUSES },
      { name: "budget", label: "תקציב", type: "number" },
      { name: "email", label: "אימייל", type: "text" },
    ];

    try {
      table = await prisma.tableMeta.create({
        data: {
          name: "לידים",
          slug: LEADS_TABLE_SLUG,
          schemaJson: schema,
          companyId: companyId,
          createdBy: userId,
        },
      });
      console.log(`Created table: ${table.name} (ID: ${table.id})`);
    } catch (createError) {
      console.error("Error creating table:", createError);
      return;
    }
  } else {
    console.log(`Found table: ${table.name} (ID: ${table.id})`);
  }

  // Generate Records
  const recordsData = [];
  for (let i = 0; i < LEADS_COUNT; i++) {
    const firstName = getRandomElement(FIRST_NAMES);
    const lastName = getRandomElement(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${getRandomInt(1, 99)}@example.com`;

    const recordData = {
      leadName: fullName,
      phoneNumber: generatePhoneNumber(),
      source: getRandomElement(SOURCES),
      status: getRandomElement(STATUSES),
      budget: getRandomInt(1000, 50000),
      email: email,
    };

    recordsData.push({
      companyId: companyId,
      tableId: table.id,
      data: recordData,
      createdBy: userId,
    });
  }

  // Insert Records
  console.log(`Inserting ${LEADS_COUNT} records...`);
  try {
    const result = await prisma.record.createMany({
      data: recordsData,
    });
    console.log(
      `Successfully inserted ${result.count} records into "${table.name}".`,
    );
  } catch (error) {
    console.error("Error inserting leads:", error);
  }
}

async function seedClientsAndFinance(companyId: number) {
  console.log(`\n--- Seeding Clients & Finance ---`);

  for (let i = 0; i < CLIENTS_COUNT; i++) {
    const firstName = getRandomElement(FIRST_NAMES);
    const lastName = getRandomElement(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const company = getRandomElement(COMPANY_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${getRandomInt(1, 99)}@client.com`;

    // 1. Create Client
    const client = await prisma.client.create({
      data: {
        companyId,
        name: fullName,
        businessName: company,
        email: email,
        phone: generatePhoneNumber(),
        notes: "Automated seed client",
      },
    });

    console.log(`Created Client: ${client.name} (ID: ${client.id})`);

    // 2. Create One Time Payment
    const isPaid = Math.random() > 0.5;
    const paymentAmount = getRandomInt(500, 10000);
    const paymentDate = new Date();
    // Randomize date a bit back or forward
    paymentDate.setDate(paymentDate.getDate() + getRandomInt(-10, 10));

    await prisma.oneTimePayment.create({
      data: {
        clientId: client.id,
        companyId,
        title: `Project Payment - ${company}`,
        amount: paymentAmount,
        dueDate: paymentDate,
        paidDate: isPaid ? paymentDate : null,
        status: isPaid ? "paid" : "pending",
        notes: isPaid ? "Paid in full" : "Awaiting payment",
      },
    });

    // 3. Create Retainer
    // "All retainers will be at today's date for the billing date"
    const today = new Date();
    const retainerAmount = getRandomInt(1000, 5000);

    await prisma.retainer.create({
      data: {
        clientId: client.id,
        companyId,
        title: `Monthly Retainer - ${company}`,
        amount: retainerAmount,
        frequency: "monthly",
        startDate: today,
        nextDueDate: today,
        status: "active",
        notes: "Automated seed retainer",
      },
    });
  }

  console.log(
    `Successfully created ${CLIENTS_COUNT} clients with finance data.`,
  );
}

async function main() {
  console.log(`Starting general seed script...`);

  // 1. Get the company & user
  const company = await prisma.company.findFirst();
  if (!company) {
    throw new Error("No company found. Please create a company first.");
  }

  const user = await prisma.user.findFirst({
    where: { companyId: company.id },
  });
  const userId = user ? user.id : 1;

  console.log(`Using company: ${company.name} (ID: ${company.id})`);

  await seedLeads(company.id, userId);
  await seedClientsAndFinance(company.id);
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
