import type { Experience, ExperienceDraft } from "@/types/domain";

/** A blank editable draft for manual creation from the panel. */
export function blankDraft(): ExperienceDraft {
  return {
    listing_type: "experience",
    title: "",
    description: "",
    highlights: [],
    whats_included: [],
    whats_not_included: [],
    what_to_bring: [],
    price_per_person: 0,
    currency: "USD",
    min_capacity: 1,
    max_capacity: 10,
    duration_hours: 2,
    languages: ["Español"],
    image_urls: [],
    registration_deadline_hours: 12,
    schedules: [],
    tiers: [],
    _sources: {},
  };
}

/** Convert a saved Experience into an editable draft (for the edit flow). */
export function experienceToDraft(exp: Experience): ExperienceDraft {
  const {
    id: _id,
    provider_profile_id: _p,
    publication_status: _ps,
    is_active: _a,
    created_at: _c,
    updated_at: _u,
    ...rest
  } = exp;
  // Mark every field as "extracted" so the edit form shows no "assumed" dots.
  const _sources = Object.keys(rest).reduce(
    (acc, k) => ({ ...acc, [k]: "extracted" as const }),
    {} as ExperienceDraft["_sources"]
  );
  return { ...rest, _sources };
}

/** The editable fields a draft contributes back to an experience. */
export function draftToPatch(d: ExperienceDraft): Partial<Experience> {
  return {
    title: d.title,
    description: d.description,
    price_per_person: d.price_per_person,
    duration_hours: d.duration_hours,
    city: d.city,
    min_capacity: d.min_capacity,
    max_capacity: d.max_capacity,
    schedules: d.schedules,
    highlights: d.highlights,
    whats_included: d.whats_included,
    image_urls: d.image_urls,
    featured_image: d.featured_image,
  };
}
