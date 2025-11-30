"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all tasks
export async function GET(request: NextRequest) {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
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
    const body = await request.json();

    // Convert dueDate string to Date object if present
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const newTask = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description,
        status: body.status ?? "todo",
        assignee: body.assignee,
        priority: body.priority,
        tags: body.tags || [],
        dueDate: dueDate,
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
