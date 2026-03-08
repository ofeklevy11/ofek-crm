import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { validateUserInCompany } from "@/lib/company-validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { updateTaskSchema } from "@/lib/validations/tasks";
import { inngest } from "@/lib/inngest/client";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("TaskAPI");

// GET a single task
async function handleGET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission check
    const canView = user.role === "admin" || hasUserFlag(user, "canViewTasks");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.taskRead);
    if (rateLimited) return rateLimited;

    // Visibility filtering
    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const whereClause = canViewAll
      ? { id, companyId: user.companyId }
      : { id, companyId: user.companyId, assigneeId: user.id };

    const task = await prisma.task.findFirst({
      where: whereClause,
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
          select: { id: true, name: true },
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
    log.error("Failed to fetch task", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

// PATCH (update) a task
async function handlePATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission check
    if (!hasUserFlag(user, "canViewTasks")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.taskMutation);
    if (rateLimited) return rateLimited;

    // Validate input
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // SECURITY: Validate assigneeId belongs to same company
    if (data.assigneeId) {
      if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
        return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
      }
    }

    // Fetch existing task for permission check and status-change detection
    const existingTask = await prisma.task.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, assigneeId: true, status: true },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Authorization: only admin/canViewAllTasks or the assignee can edit
    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const isAssignee = existingTask.assigneeId === user.id;
    if (!canViewAll && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update data from validated fields
    const dataToUpdate: Record<string, unknown> = {};
    if (data.title !== undefined) dataToUpdate.title = data.title;
    if (data.description !== undefined) dataToUpdate.description = data.description;
    if (data.status !== undefined) dataToUpdate.status = data.status;
    if (data.assigneeId !== undefined) dataToUpdate.assigneeId = data.assigneeId;
    if (data.priority !== undefined) dataToUpdate.priority = data.priority;
    if (data.tags !== undefined) dataToUpdate.tags = data.tags;
    if (data.dueDate !== undefined) dataToUpdate.dueDate = data.dueDate;

    const isStatusChange = data.status !== undefined && existingTask.status !== data.status;

    // Wrap update + audit log in a transaction
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
            select: { id: true, name: true },
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
                from: existingTask.status,
                to: data.status,
              },
            },
          },
        });
      }

      return result;
    });

    // Send automation event outside transaction
    if (isStatusChange) {
      try {
        await inngest.send({
          id: `task-status-${user.companyId}-${updated.id}-${data.status}`,
          name: "automation/task-status-change",
          data: {
            taskId: updated.id,
            taskTitle: updated.title,
            fromStatus: existingTask.status,
            toStatus: data.status,
            companyId: user.companyId,
          },
        });
      } catch (autoError) {
        log.error("Inngest send failed, falling back to direct automation execution", { error: String(autoError) });
        try {
          const { processTaskStatusChange } = await import("@/app/actions/automations-core");
          await processTaskStatusChange(updated.id, updated.title, existingTask.status, data.status!, user.companyId);
        } catch (directErr) {
          log.error("Direct automation execution also failed", { error: String(directErr) });
        }
      }
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    log.error("Failed to update task", { error: String(error) });
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
async function handleDELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission check
    const canDelete =
      user.role === "admin" || hasUserFlag(user, "canCreateTasks");
    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.taskMutation);
    if (rateLimited) return rateLimited;

    // Single query: deleteMany returns count, no need for find-first
    const result = await prisma.task.deleteMany({
      where: { id, companyId: user.companyId },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete task", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/tasks/[id]", handleGET);
export const PATCH = withMetrics("/api/tasks/[id]", handlePATCH);
export const DELETE = withMetrics("/api/tasks/[id]", handleDELETE);
