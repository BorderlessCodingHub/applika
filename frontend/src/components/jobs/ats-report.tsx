"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AtsReport } from "@/services/types/jobs";

interface AtsReportProps {
  report: AtsReport;
}

export function AtsReportDisplay({ report }: AtsReportProps) {
  return (
    <div className="space-y-3">
      {report.warnings.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            ATS Warnings
          </p>
          <ul className="space-y-1">
            {report.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.missing_keywords.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Missing Keywords
          </p>
          <div className="flex flex-wrap gap-1">
            {report.missing_keywords.map((k) => (
              <Badge key={k} variant="outline" className="text-xs">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {report.warnings.length === 0 && report.missing_keywords.length === 0 && (
        <p className="text-sm text-green-600 dark:text-green-400">
          ATS check passed
        </p>
      )}
    </div>
  );
}
