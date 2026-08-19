import { NextRequest, NextResponse } from "next/server";
import { getSession, canAccessAllMeetings } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      analysis: true,
      participants: true,
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Employees can only view meetings they attended
  if (!canAccessAllMeetings(session.role)) {
    const isParticipant = meeting.participants.some(
      (p: any) => p.email === session.email
    );
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(meeting);
}
