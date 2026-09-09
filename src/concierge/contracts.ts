import { z } from "zod";

export const IntentSchema = z.enum(["discover", "specific_experience", "compare", "availability", "booking", "general_question"]);
export const ProfileSchema = z.object({
  adults: z.number().int().min(1).max(500).optional(),
  children: z.number().int().min(0).max(500).optional(),
  groupType: z.enum(["solo", "couple", "friends", "family", "corporate", "other"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s).optional(),
  timePreference: z.enum(["morning", "afternoon", "evening"]).optional(),
  budgetMin: z.number().min(0).max(1000000).optional(),
  budgetMax: z.number().min(0).max(1000000).optional(),
  budgetBasis: z.enum(["person", "group"]).optional(),
  currency: z.enum(["USD"]).optional(),
  locationPreferences: z.array(z.string().max(100)).max(10).optional(),
  interests: z.array(z.string().max(60)).max(20).optional(),
  desiredFeelings: z.array(z.string().max(60)).max(20).optional(),
  adventureLevel: z.number().int().min(1).max(5).optional(),
  physicalIntensity: z.number().int().min(1).max(5).optional(),
  pace: z.enum(["relaxed", "balanced", "active"]).optional(),
  transportNeeded: z.boolean().optional(),
  constraints: z.array(z.string().max(100)).max(15).optional(),
  avoid: z.array(z.string().max(60)).max(20).optional(),
}).strict();
export type TravelerProfile = z.infer<typeof ProfileSchema>;
export const StateSchema = z.object({
  conversationId: z.string().uuid(), userId: z.string().uuid().optional(),
  intent: IntentSchema.default("discover"),
  stage: z.enum(["understanding", "searching", "recommending", "comparing", "availability", "booking"]).default("understanding"),
  travelerProfile: ProfileSchema.default({}),
  mentionedExperienceIds: z.array(z.string().uuid()).max(30).default([]),
  candidateExperienceIds: z.array(z.string().uuid()).max(100).default([]),
  recommendedExperienceIds: z.array(z.string().uuid()).max(3).default([]),
  rejectedExperienceIds: z.array(z.string().uuid()).max(100).default([]),
  missingInformation: z.array(z.string()).max(10).default([]),
  recommendationConfidence: z.number().min(0).max(1).optional(),
  lastQuestion: z.string().max(500).optional(),
  turnCount: z.number().int().min(0).max(1000).default(0),
  clarificationCount: z.number().int().min(0).max(3).default(0),
  recommendationLoopCount: z.number().int().min(0).max(5).default(0),
  pendingRelaxation: z.enum(["budgetMax", "date", "locationPreferences", "interests", "desiredFeelings"]).optional(),
}).strict();
export type ConciergeState = z.infer<typeof StateSchema>;
const ExperiencePathSchema = z.string().regex(/^\/e\/[a-f0-9-]{36}(?:\?(?:date=\d{4}-\d{2}-\d{2}|people=\d+)(?:&(?:date=\d{4}-\d{2}-\d{2}|people=\d+))*)?$/i);
export const RecommendationSchema = z.object({
  id: z.string().uuid(), title: z.string(), reason: z.string(),
  price: z.number().nonnegative().nullable(), currency: z.string(), priceFrom: z.boolean(),
  location: z.string(), image: z.string().optional(), path: ExperiencePathSchema,
});
export const ResponseSchema = z.object({
  text: z.string(), recommendations: z.array(RecommendationSchema).max(3),
  bookingPath: ExperiencePathSchema.optional(), handoff: z.boolean().default(false),
});
export type ConciergeResponse = z.infer<typeof ResponseSchema>;
export type ConciergeMessage = { role: "user" | "assistant"; content: string; metadata?: ConciergeResponse };
export function newState(conversationId: string, userId?: string): ConciergeState {
  return StateSchema.parse({ conversationId, userId });
}
