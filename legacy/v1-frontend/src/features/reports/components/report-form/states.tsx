import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ReportFormErrorStateProps {
  error: Error | null;
  onBack: () => void;
}

interface ReportFormSuccessStateProps {
  day: number | null;
  onBack: () => void;
}

export function ReportFormLoadingState() {
  return (
    <div className="animate-pulse space-y-8">
      <div>
        <div className="w-64 h-8 rounded bg-gray-700/50 mb-2" />
        <div className="w-32 h-5 rounded bg-gray-700/30" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-lg bg-gray-700/30" />
        ))}
      </div>
      <div className="h-48 rounded-lg bg-gray-700/30" />
    </div>
  );
}

export function ReportFormErrorState({
  error,
  onBack,
}: ReportFormErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-red-500/10 border border-red-500/30 rounded-lg p-8 text-center"
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-4">
        <AlertCircle size={32} className="text-red-400" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">Failed to load report</h3>
      <p className="text-gray-400 mb-6">
        {error?.message ||
          "There was an error loading this report. Please try again."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 hover:cursor-pointer justify-center">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Reports
        </Button>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    </motion.div>
  );
}

export function ReportFormSuccessState({
  day,
  onBack,
}: ReportFormSuccessStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-12 text-center"
    >
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 mb-6">
        <CheckCircle size={40} className="text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Report Submitted!</h2>
      <p className="text-gray-400 mb-6">
        Your Day {day} report has been successfully submitted. Great work!
      </p>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Button onClick={onBack} variant="primary" className="hover:cursor-pointer">
          Back to Reports
        </Button>
      </motion.div>
    </motion.div>
  );
}
