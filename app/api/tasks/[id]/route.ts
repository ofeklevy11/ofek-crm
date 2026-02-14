"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { validateUserInCompany } from "@/lib/company-validation";

// GET a single task
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Filter by companyId
    const task = await prisma.task.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

// PATCH (update) a task
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First verify ownership/existence
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json();

    // SECURITY: Validate assigneeId belongs to same company
    if (body.assigneeId) {
      if (!(await validateUserInCompany(body.assigneeId, user.companyId))) {
        return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
      }
    }

    // Whitelist allowed update fields to prevent mass assignment
    const allowedFields = ["title", "description", "status", "assigneeId", "priority", "dueDate", "tags"] as const;
    const dataToUpdate: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        dataToUpdate[field] = field === "dueDate" ? new Date(body[field]) : body[field];
      }
    }

    const updated = await prisma.task.update({
      where: { id, companyId: user.companyId },
      data: dataToUpdate,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating task:", error);
    // Check if error is due to record not found
    // @ts-ignore
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// DELETE a task
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership/existence first (or use deleteMany with count check)
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.deleteMany({
      where: { id, companyId: user.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    // Check if error is due to record not found
    // @ts-ignore
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
