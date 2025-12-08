import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signUserId } from "@/lib/auth";
import { cookies } from "next/headers";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9]+/g, "-") // Support Hebrew characters
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, companyName, isNewCompany } = body;

    // Validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "אנא מלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "הסיסמא חייבת להיות לפחות 6 תווים" },
        { status: 400 }
      );
    }

    if (isNewCompany && !companyName) {
      return NextResponse.json({ error: "אנא הזן שם ארגון" }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "משתמש עם אימייל זה כבר קיים. אנא התחבר או השתמש באימייל אחר.",
        },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Force new company creation if isNewCompany is true
    if (!isNewCompany) {
      return NextResponse.json(
        { error: "הצטרפות לארגון קיים אינה נתמכת כרגע" },
        { status: 400 }
      );
    }

    // Use a transaction to ensure atomicity - both company and user are created together
    const result = await prisma.$transaction(async (tx) => {
      // Create new company
      const slug = generateSlug(companyName);

      // Check if slug already exists and make it unique if needed
      let finalSlug = slug;
      let counter = 1;
      while (await tx.company.findUnique({ where: { slug: finalSlug } })) {
        finalSlug = `${slug}-${counter}`;
        counter++;
      }

      const company = await tx.company.create({
        data: {
          name: companyName,
          slug: finalSlug,
        },
      });

      // Create user with the new company ID
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          companyId: company.id, // Explicitly use the newly created company ID
          role: "admin", // First user in a new company is always admin
        },
      });

      return { user, company };
    });

    // Create session cookie
    const token = signUserId(result.user.id);
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
      sameSite: "lax",
    });

    console.log(
      `✅ Successfully created company "${result.company.name}" (ID: ${result.company.id}) and user "${result.user.name}" (ID: ${result.user.id})`
    );

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      },
      company: { id: result.company.id, name: result.company.name },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "שגיאה פנימית בשרת" }, { status: 500 });
  }
}
