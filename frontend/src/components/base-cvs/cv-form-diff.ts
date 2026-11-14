import type { ReactNode } from "react";

import type { CvFormSectionId } from "@/components/base-cvs/cv-form-sections";
import type { CvFormValues, CvSections } from "@/components/base-cvs/types";

/** Optional diff seam of `CvFormSections`; absent (master CV), the body renders exactly as before. */
export interface CvFormDiffSlots {
  /** `fieldLabel` must be unique on the page, e.g. "Role, experience 2". */
  field: (path: CvDiffPath, fieldLabel: string) => ReactNode;
  /** Non-interactive: the stretched header trigger covers it. */
  sectionStatus: (section: CvFormSectionId) => ReactNode;
  itemBadge: (section: CvFormListSectionId, itemId: string) => ReactNode;
  itemClassName: (
    section: CvFormListSectionId,
    itemId: string,
  ) => string | undefined;
  removedRows: (
    section: CvFormListSectionId,
  ) => readonly CvRemovedRowSlot[] | undefined;
}

export interface CvRemovedRowSlot {
  key: string;
  /** Current-list index the row renders before; Restore reinserts at the same index. */
  at: number;
  node: ReactNode;
}

export type CvFormListSectionId = keyof CvSections;

export type CvScalarDiffPath = Exclude<keyof CvFormValues, CvFormListSectionId>;

export type CvListItem<S extends CvFormListSectionId> = CvSections[S][number];

export type CvDiffPath = CvScalarDiffPath | `${CvFormListSectionId}:${string}`;

/** `experience:<id>` */
export function cvItemDiffPath(
  section: CvFormListSectionId,
  itemId: string,
): CvDiffPath {
  return `${section}:${itemId}`;
}

/** `experience:<id>.role` */
export function cvItemFieldDiffPath<S extends CvFormListSectionId>(
  section: S,
  itemId: string,
  field: Exclude<keyof CvListItem<S>, "id"> & string,
): CvDiffPath {
  return `${section}:${itemId}.${field}`;
}
