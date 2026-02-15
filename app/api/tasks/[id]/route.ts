"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { validateUserInCompany } from "@/lib/company-validation";
import { inngest } from "@/lib/inngest/client";

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
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        creator: {
          select: { id: true, name: true },
        },
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
        dataToUpdate[field] = field === "dueDate" && body[field] ? new Date(body[field]) : body[field];
      }
    }

    // Fetch old status for change detection (only when status is being updated)
    let oldStatus: string | undefined;
    if (dataToUpdate.status !== undefined) {
      const existing = await prisma.task.findFirst({
        where: { id, companyId: user.companyId },
        select: { status: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      oldStatus = existing.status;
    }

    const isStatusChange = dataToUpdate.status !== undefined && oldStatus !== dataToUpdate.status;

    // Wrap update + audit log in a transaction to match server action behavior
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id, companyId: user.companyId },
        data: dataToUpdate,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          assigneeId: true,
          priority: true,
          dueDate: true,
          tags: true,
          creatorId: true,
          createdAt: true,
          updatedAt: true,
          assignee: {
            select: { id: true, name: true, email: true },
          },
          creator: {
            select: { id: true, name: true },
          },
        },
      });

      if (isStatusChange) {
        await tx.auditLog.create({
          data: {
            taskId: id,
            action: "UPDATE",
            companyId: user.companyId,
            userId: user.id,
            diffJson: {
              status: {
                from: oldStatus,
                to: dataToUpdate.status,
              },
            },
          },
        });
      }

      return result;
    });

    // Send automation event outside transaction (idempotent, has own retry)
    if (isStatusChange) {
      try {
        await inngest.send({
          id: `task-status-${user.companyId}-${updated.id}-${dataToUpdate.status}`,
          name: "automation/task-status-change",
          data: {
            taskId: updated.id,
            taskTitle: updated.title,
            fromStatus: oldStatus,
            toStatus: dataToUpdate.status,
            companyId: user.companyId,
          },
        });
      } catch (autoError) {
        console.error(`[Tasks API] Failed to send automation event:`, autoError);
      }
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error updating task:", error);
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

    // Single query: deleteMany returns count, no need for find-first
    const result = await prisma.task.deleteMany({
      where: { id, companyId: user.companyId },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
