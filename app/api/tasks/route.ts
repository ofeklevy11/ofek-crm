import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { validateUserInCompany } from "@/lib/company-validation";

// GET all tasks
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Filter by companyId for multi-tenancy
    const tasks = await prisma.task.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        title: true,
        status: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST a new task
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // SECURITY: Validate assigneeId belongs to same company
    if (body.assigneeId) {
      if (!(await validateUserInCompany(body.assigneeId, user.companyId))) {
        return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
      }
    }

    // Convert dueDate string to Date object if present
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const newTask = await prisma.task.create({
      data: {
        companyId: user.companyId, // CRITICAL: Set companyId for multi-tenancy
        creatorId: user.id,
        title: body.title,
        description: body.description,
        status: body.status ?? "todo",
        assigneeId: body.assigneeId,
        priority: body.priority,
        tags: body.tags || [],
        dueDate: dueDate,
      },
      select: {
        id: true,
        title: true,
        status: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
