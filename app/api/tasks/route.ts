"use server";

import { NextRequest, NextResponse } from "next/server";
import { tasksStorage } from "@/lib/tasksStorage";

// GET all tasks
export async function GET(request: NextRequest) {
  const tasks = tasksStorage.getAll();
  return NextResponse.json(tasks);
}

// POST a new task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const newTask = tasksStorage.create({
      title: body.title,
      description: body.description,
      status: body.status ?? "todo",
      assignee: body.assignee,
      priority: body.priority,
      tags: body.tags,
      dueDate: body.dueDate,
    });
    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
