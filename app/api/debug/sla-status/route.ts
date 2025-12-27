import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Debug endpoint to see SLA status of tickets
 * GET /api/debug/sla-status
 */
export async function GET() {
  try {
    // Get all open tickets with their SLA info
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        slaDueDate: true,
        slaResponseDueDate: true,
        createdAt: true,
        companyId: true,
        breaches: {
          select: { id: true, breachedAt: true, breachType: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get SLA policies
    const policies = await prisma.slaPolicy.findMany({
      select: {
        priority: true,
        responseTimeMinutes: true,
        resolveTimeMinutes: true,
        companyId: true,
      },
    });

    const now = new Date();

    const ticketAnalysis = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,

      // Response time info
      slaResponseDueDate: t.slaResponseDueDate?.toISOString() || "NOT SET",
      hasResponseDueDate: !!t.slaResponseDueDate,
      isResponseOverdue:
        t.status === "OPEN" && t.slaResponseDueDate
          ? t.slaResponseDueDate < now
          : false,
      minutesUntilResponseDue:
        t.slaResponseDueDate && t.status === "OPEN"
          ? Math.round((t.slaResponseDueDate.getTime() - now.getTime()) / 60000)
          : null,

      // Resolve time info
      slaDueDate: t.slaDueDate?.toISOString() || "NOT SET",
      hasSlaDueDate: !!t.slaDueDate,
      isResolveOverdue: t.slaDueDate ? t.slaDueDate < now : false,
      minutesUntilResolveDue: t.slaDueDate
        ? Math.round((t.slaDueDate.getTime() - now.getTime()) / 60000)
        : null,

      // Breaches
      breaches: t.breaches.map((b) => ({
        type: b.breachType,
        at: b.breachedAt,
      })),
      hasResponseBreach: t.breaches.some((b) => b.breachType === "RESPONSE"),
      hasResolveBreach: t.breaches.some((b) => b.breachType === "RESOLVE"),

      createdAt: t.createdAt.toISOString(),
    }));

    return NextResponse.json({
      serverTime: now.toISOString(),
      ticketCount: tickets.length,
      tickets: ticketAnalysis,
      slaPolicies: policies,
      summary: {
        withResponseDueDate: tickets.filter((t) => t.slaResponseDueDate).length,
        withResolveDueDate: tickets.filter((t) => t.slaDueDate).length,
        responseOverdue: ticketAnalysis.filter(
          (t) => t.isResponseOverdue && !t.hasResponseBreach
        ).length,
        resolveOverdue: ticketAnalysis.filter(
          (t) => t.isResolveOverdue && !t.hasResolveBreach
        ).length,
        alreadyBreached: tickets.filter((t) => t.breaches.length > 0).length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
