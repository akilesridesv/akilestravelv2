import { z } from "zod";
import { IntentSchema, ProfileSchema } from "../../src/concierge/contracts";

export const ExtractionSchema = z.object({
  intent: IntentSchema,
  profile: ProfileSchema,
  references: z.array(z.string().max(100)).max(3),
  feedback: z.enum(["none", "too_intense", "reject"]),
  questionTopic: z.enum(["details", "includes", "policies", "price"]),
  // Question wording is selected from reviewed templates, never free model prose.
  question: z.enum(["none", "style", "date", "party", "experience", "budget_basis"]),
}).strict();
export type Extraction = z.infer<typeof ExtractionSchema>;
export const ReasonSchema = z.enum(["interests", "feelings", "adventure", "group", "pace", "budget", "location"]);
export const RankingSchema = z.object({ ranked: z.array(z.object({
  experienceId: z.string().uuid(), reasonCodes: z.array(ReasonSchema).max(7),
}).strict()).max(3) }).strict();
export const MetadataSchema = z.object({
  interests: z.array(z.string()).optional(), desired_feelings: z.array(z.string()).optional(),
  best_for: z.array(z.string()).optional(), adventure_level: z.number().min(1).max(5).optional(),
  physical_intensity: z.number().min(1).max(5).optional(), pace: z.enum(["relaxed", "balanced", "active"]).optional(),
  min_age: z.number().min(0).optional(), children_allowed: z.boolean().optional(),
  transport_included: z.boolean().optional(), social_style: z.array(z.string()).optional(),
  indoor_outdoor: z.array(z.string()).optional(), romantic_score: z.number().min(0).max(1).optional(),
  family_score: z.number().min(0).max(1).optional(), authenticity_score: z.number().min(0).max(1).optional(),
  nature_score: z.number().min(0).max(1).optional(),
}).strict();
export type RecommendationMetadata = z.infer<typeof MetadataSchema>;
export const RequestSchema = z.object({
  action: z.enum(["load", "turn"]), token: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid().optional(), message: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((r) => r.action === "load" || (!!r.requestId && !!r.message));
