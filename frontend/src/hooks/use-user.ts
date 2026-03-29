import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
