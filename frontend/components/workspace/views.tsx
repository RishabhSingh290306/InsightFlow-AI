"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DatasetProfile, DatasetUnderstanding } from "@/lib/types";

export const STATUS_VARIANT: Record<string, "secondary" | "muted" | "default" | "lavender"> = {
  uploaded: "secondary",
  profiled: "muted",
  understood: "default",
};

export function DatasetStatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? "muted";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

export function ProfileView({ profile }: { profile: DatasetProfile }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Profile</h3>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{profile.row_count} rows</span>
        <span>·</span>
        <span>{profile.column_count} columns</span>
        <span>·</span>
        <span>{profile.null_percentage}% null</span>
        <span>·</span>
        <span>{profile.duplicate_row_count} duplicates</span>
        {profile.potential_target_column && (
          <>
            <span>·</span>
            <span>target: {profile.potential_target_column}</span>
          </>
        )}
      </div>

      {profile.data_quality_issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {profile.data_quality_issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {profile.column_names.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {profile.inferred_types[c] ?? ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.preview.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {profile.column_names.map((c) => (
                  <td key={c} className="px-3 py-2">
                    {row[c] === null || row[c] === undefined ? (
                      <span className="text-muted-foreground">∅</span>
                    ) : (
                      String(row[c])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Showing first {profile.preview.length} rows.</p>
    </div>
  );
}

export function UnderstandingView({ understanding }: { understanding: DatasetUnderstanding }) {
  if (!understanding.ai_available) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>{understanding.data_quality_summary}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Insights</h3>
      <p className="text-sm">{understanding.dataset_description}</p>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Domain: {understanding.business_domain_guess}</span>
        <span>·</span>
        <span>Use case: {understanding.likely_use_case}</span>
        {understanding.possible_target_column && (
          <>
            <span>·</span>
            <span>Target: {understanding.possible_target_column}</span>
          </>
        )}
        <span>·</span>
        <span>Confidence: {(understanding.confidence_score * 100).toFixed(0)}%</span>
      </div>

      <Section title="Data quality" items={[understanding.data_quality_summary]} />
      <Section title="Cleaning recommendations" items={understanding.cleaning_recommendations} />
      <Section title="Suggested visualizations" items={understanding.suggested_visualizations} />
      <Section
        title="Suggested business questions"
        items={understanding.suggested_business_questions}
      />
      {understanding.initial_business_observations.length > 0 && (
        <Section
          title="Initial observations"
          items={understanding.initial_business_observations}
        />
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
