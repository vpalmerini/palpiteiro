import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getPoolDetail,
  getPredictionSetup,
  type PoolDetail,
  type PredictionSetup,
} from "@/lib/api";
import type { Prediction } from "@/types";

export const poolKeys = {
  all: ["pool"] as const,
  detail: (slug: string) => [...poolKeys.all, slug, "detail"] as const,
  predictions: (slug: string) => [...poolKeys.all, slug, "predictions"] as const,
};

const POOL_STALE_MS = 60_000;
const POOL_GC_MS = 5 * 60_000;

export function usePoolDetail(slug: string) {
  return useQuery({
    queryKey: poolKeys.detail(slug),
    queryFn: () => getPoolDetail(slug),
    enabled: Boolean(slug),
    staleTime: POOL_STALE_MS,
    gcTime: POOL_GC_MS,
  });
}

export function usePredictionSetup(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: poolKeys.predictions(slug),
    queryFn: () => getPredictionSetup(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: POOL_STALE_MS,
    gcTime: POOL_GC_MS,
  });
}

export function usePrefetchPredictionSetup() {
  const queryClient = useQueryClient();

  return (slug: string) => {
    if (!slug) return;
    void queryClient.prefetchQuery({
      queryKey: poolKeys.predictions(slug),
      queryFn: () => getPredictionSetup(slug),
      staleTime: POOL_STALE_MS,
    });
  };
}

export function patchPredictionInSetupCache(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  prediction: Prediction,
) {
  queryClient.setQueryData<PredictionSetup>(poolKeys.predictions(slug), (current) => {
    if (!current) return current;
    const rest = current.predictions.filter((item) => item.matchId !== prediction.matchId);
    return { ...current, predictions: [...rest, prediction] };
  });

  queryClient.setQueryData<PoolDetail>(poolKeys.detail(slug), (current) => {
    if (!current) return current;
    if (current.predictedMatchIds.includes(prediction.matchId)) return current;
    return {
      ...current,
      predictedMatchIds: [...current.predictedMatchIds, prediction.matchId],
    };
  });
}
