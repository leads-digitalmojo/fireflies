export type UserRole = "CEO" | "HR" | "MANAGER" | "EMPLOYEE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface ActionItem {
  owner: string;
  task: string;
  deadline: string;
}

export interface EmployeeScore {
  name: string;
  score: number;
  strengths: string[];
  improvements: string[];
}

export interface TeamBreakdown {
  communication: number;
  clarity: number;
  professionalism: number;
  problemSolving: number;
  clientHandling: number;
}

export interface GeminiAnalysis {
  overallTeamScore: number;
  clientHealthScore: number;
  clientSentiment: Sentiment;
  riskLevel: RiskLevel;
  teamBreakdown: TeamBreakdown;
  summary: string[];
  minutesOfMeeting: string[];
  actionItems: ActionItem[];
  risks: string[];
  recommendations: string[];
  employeeScores: EmployeeScore[];
}

export interface FirefliesSpeaker {
  name: string;
}

export interface FirefliesTranscript {
  id: string;
  title: string;
  date: number; // unix timestamp
  duration: number;
  transcript_url?: string;
  sentences: FirefliesSentence[];
  speakers: FirefliesSpeaker[];
  meeting_attendees?: FirefliesAttendee[];
  summary?: FirefliesSummary;
}

export interface FirefliesSentence {
  index: number;
  speaker_name: string;
  raw_text: string;
  start_time: number;
  end_time: number;
}

export interface FirefliesAttendee {
  displayName?: string;
  email?: string;
  name?: string;
}

export interface FirefliesSummary {
  keywords?: string[];
  action_items?: string[];
  outline?: string[];
  overview?: string;
  shorthand_bullet?: string[];
}

export interface MeetingWithAnalysis {
  id: string;
  firefliesId: string;
  title: string;
  clientName: string | null;
  meetingDate: Date | null;
  duration: number | null;
  transcript: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: Participant[];
  analysis: Analysis | null;
}

export interface Participant {
  id: string;
  meetingId: string;
  name: string;
  email: string | null;
  role: string | null;
}

export interface Analysis {
  id: string;
  meetingId: string;
  overallTeamScore: number;
  clientHealthScore: number;
  clientSentiment: Sentiment;
  riskLevel: RiskLevel;
  teamBreakdown: TeamBreakdown | null;
  summary: string[];
  minutesOfMeeting: string[];
  actionItems: ActionItem[];
  risks: string[];
  recommendations: string[];
  employeeScores: EmployeeScore[];
  createdAt: Date;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface DashboardStats {
  totalMeetings: number;
  meetingsThisMonth: number;
  avgTeamScore: number;
  avgClientHealthScore: number;
  riskyClients: number;
  pendingActionItems: number;
}

export interface AnalyticsFilters {
  client?: string;
  employee?: string;
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  maxScore?: number;
  riskLevel?: RiskLevel;
  sentiment?: Sentiment;
}
