import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SponsorWatch } from "@shared/schema";

interface CreateSponsorWatchVariables {
  companyName: string;
  companyNumber?: string;
}

export function useCreateSponsorWatch() {
  const queryClient = useQueryClient();

  return useMutation<SponsorWatch, Error, CreateSponsorWatchVariables>({
    mutationFn: async (variables) => {
      const res = await apiRequest("POST", "/api/sponsor-watch", variables);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsor-watch"] });
    },
  });
}
