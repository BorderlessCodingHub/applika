import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";
import { UpdateUserPayload } from "@/services/types/users";

const USER_QUERY_KEY = ["user", "me"] as const;

const CONNECTED_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DISCONNECTED_INTERVAL = 10 * 1000; // 10 seconds on failure

export function useUserProfile() {
  return useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: () => services.users.getMe(),
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error ? DISCONNECTED_INTERVAL : CONNECTED_INTERVAL,
    refetchIntervalInBackground: true,
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
