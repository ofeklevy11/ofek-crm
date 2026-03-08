import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { validateUserInCompany } from "@/lib/company-validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createTaskSchema } from "@/lib/validations/tasks";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("TasksAPI");

// GET all tasks
async function handleGET(request: NextRequest) {
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

    // Visibility filtering: non-admin without canViewAllTasks only sees own tasks
    const canViewAll =
      user.role === "admin" || hasUserFlag(user, "canViewAllTasks");
    const whereClause = canViewAll
      ? { companyId: user.companyId }
      : { companyId: user.companyId, assigneeId: user.id };

    const tasks = await prisma.task.findMany({
      where: whereClause,
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
    log.error("Failed to fetch tasks", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST a new task
async function handlePOST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission check
    const canCreate =
      user.role === "admin" || hasUserFlag(user, "canCreateTasks");
    if (!canCreate) {
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
    const parsed = createTaskSchema.safeParse(body);
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

    const newTask = await prisma.task.create({
      data: {
        companyId: user.companyId,
        creatorId: user.id,
        title: data.title,
        description: data.description ?? undefined,
        status: data.status,
        assigneeId: data.assigneeId ?? undefined,
        priority: data.priority ?? undefined,
        tags: data.tags || [],
        dueDate: data.dueDate,
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
    log.error("Failed to create task", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/tasks", handleGET);
export const POST = withMetrics("/api/tasks", handlePOST);
