import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { title, description, startTime, endTime, color } = body;

    const event = await prisma.calendarEvent.update({
      where: { id: params.id },
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        color,
      },
    });

    // Trigger view automations
    console.log(
      `[Calendar API] Updated event ${event.id}, triggering automations`
    );
    try {
      const { processViewAutomations } = await import(
        "@/app/actions/automations"
      );
      await processViewAutomations();
      console.log(`[Calendar API] View automations triggered successfully`);
    } catch (autoError) {
      console.error("[Calendar API] Failed to trigger automations:", autoError);
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error("Error updating calendar event:", error);
    return NextResponse.json(
      { error: "Failed to update calendar event" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.calendarEvent.delete({
      where: { id: params.id },
    });

    // Trigger view automations
    console.log(
      `[Calendar API] Deleted event ${params.id}, triggering automations`
    );
    try {
      const { processViewAutomations } = await import(
        "@/app/actions/automations"
      );
      await processViewAutomations();
      console.log(`[Calendar API] View automations triggered successfully`);
    } catch (autoError) {
      console.error("[Calendar API] Failed to trigger automations:", autoError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return NextResponse.json(
      { error: "Failed to delete calendar event" },
      { status: 500 }
    );
  }
}
