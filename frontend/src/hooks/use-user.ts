import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";

import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import { UpdateUserPayload } from "@/services/types/users";

const USER_QUERY_KEY = ["user", "me"] as const;

export function useUserProfile(enabled = true) {
  return useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: () => services.users.getMe(),
    enabled,
  });
}

export function useMutateUserProfile() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: UpdateUserPayload) => services.users.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
      toast.success("Profile updated");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  async function submit(data: UpdateUserPayload) {
    await mutation.mutateAsync(data);
  }

  return {
    submit,
    isPending: mutation.isPending,
    isSubmitting: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error as Error | null,
  };
}

export function useAgenda(params?: {
  from_date?: string;
  to_date?: string;
}) {
  return useQuery({
    queryKey: ["user", "agenda", params],
    queryFn: () => services.users.getAgenda(params),
    staleTime: 60_000,
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => services.users.deleteMe(),
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}
