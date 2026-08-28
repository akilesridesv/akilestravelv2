import { useEffect, useState } from "react";
import { useApp } from "@/state/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import * as repo from "@/data/repo";
import type { PublicExperience } from "@/data/repo";
import type { ProviderProfile } from "@/types/domain";

// Tourist-facing data. With Supabase configured it reads published experiences
// via RLS; locally it falls back to the provider's own store so dev isn't empty.

export function usePublishedExperiences() {
  const localExps = useApp((s) => s.experiences);
  const localProv = useApp((s) => s.provider);
  const [data, setData] = useState<PublicExperience[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (isSupabaseConfigured) {
      setLoading(true);
      repo
        .loadPublishedExperiences()
        .then((d) => alive && (setData(d), setLoading(false)))
        .catch((e) => alive && (setError(e?.message ?? String(e)), setLoading(false)));
    } else {
      setData(localExps.map((e) => ({ ...e, provider: localProv ?? undefined })));
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [localExps, localProv]);

  return { data, loading, error };
}

export function usePublishedExperience(id?: string) {
  const local = useApp((s) => s.experiences.find((e) => e.id === id));
  const localProv = useApp((s) => s.provider);
  const [data, setData] = useState<PublicExperience | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    if (isSupabaseConfigured) {
      setLoading(true);
      repo
        .loadPublishedExperience(id)
        .then((d) => alive && (setData(d), setLoading(false)))
        .catch(() => alive && (setData(null), setLoading(false)));
    } else {
      setData(local ? { ...local, provider: localProv ?? undefined } : null);
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id, local, localProv]);

  return { data, loading };
}

export function useProviderPublic(id?: string) {
  const localProv = useApp((s) => s.provider);
  const localExps = useApp((s) => s.experiences);
  const [data, setData] = useState<
    { provider: ProviderProfile; experiences: PublicExperience[] } | null | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    if (isSupabaseConfigured) {
      setLoading(true);
      repo
        .loadProviderPublicById(id)
        .then((d) => alive && (setData(d), setLoading(false)))
        .catch(() => alive && (setData(null), setLoading(false)));
    } else {
      if (localProv && localProv.id === id)
        setData({
          provider: localProv,
          experiences: localExps.map((e) => ({ ...e, provider: localProv })),
        });
      else setData(null);
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id, localProv, localExps]);

  return { data, loading };
}
