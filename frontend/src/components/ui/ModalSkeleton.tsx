import Skeleton from "@/components/ui/Skeleton";

export default function ModalSkeleton({
  numFields = 2,
  showTextarea = true,
  showFooter = true,
}: {
  numFields?: number;
  showTextarea?: boolean;
  showFooter?: boolean;
}) {
  return (
    <div className="animate-pulse space-y-5 px-4 md:px-8 py-6">
      <Skeleton width="33%" height="1.5rem" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
        {Array.from({ length: numFields }).map((_, i) => (
          <Skeleton key={i} width="80%" mdWidth="60%" height="2.5rem" />
        ))}
      </div>

      {showTextarea && <Skeleton width="80%" height="150px" className="mt-4" />}

      {showFooter && (
        <div className="flex justify-end gap-4 mt-6">
          <Skeleton width="6rem" height="2.5rem" />
          <Skeleton width="8rem" height="2.5rem" />
        </div>
      )}
    </div>
  );
}
