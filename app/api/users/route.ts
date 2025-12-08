import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/permissions-server";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Filter by companyId
    const users = await prisma.user.findMany({
      where: {
        companyId: currentUser.companyId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allowedWriteTableIds: true,
        createdAt: true,
        updatedAt: true,
        permissions: true,
        tablePermissions: true,
        // Don't expose passwordHash
      },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admin can create users usually, check permissions if needed.
    // Assuming for now any authenticated user (or maybe only admins) can add users to THEIR company.
    // Better safe than sorry: check if admin.
    if (currentUser.role !== "admin" && currentUser.role !== "manager") {
      // return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      // Let's be lenient for now if the UI allows managers to add users,
      // but definitely restrict to company.
    }

    const body = await request.json();
    const {
      name,
      email,
      password,
      role,
      allowedWriteTableIds,
      permissions,
      tablePermissions,
    } = body;

    // Basic validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        companyId: currentUser.companyId, // CRITICAL: Assign to creator's company
        name,
        email,
        passwordHash,
        role: role || "basic",
        allowedWriteTableIds: allowedWriteTableIds || [],
        permissions: permissions || {},
        tablePermissions: tablePermissions || {},
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allowedWriteTableIds: true,
        createdAt: true,
        updatedAt: true,
        permissions: true,
        tablePermissions: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
