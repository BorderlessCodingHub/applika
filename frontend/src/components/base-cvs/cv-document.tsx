/**
 * The CV document's single import point.
 *
 * The vocabulary, the pure helpers and the LEAVES all live in
 * `cv-document-blocks.tsx`; `CvDocumentPreview` is the one container that
 * renders them, flowed across discrete A4 sheets (`cv-page-sheet.tsx`). This
 * module re-exports the vocabulary so `@/components/base-cvs/cv-document` stays
 * the import path it has always been.
 *
 * There used to be a SECOND container here — `CvDocument`, the continuous
 * single-page render. KODI-008 removed it: once `CvDocumentPreview` stopped
 * rendering it, nothing in `src/` did, and the parity table pinning the owner's
 * section order, the middle-dot separator, the category colon, the degree
 * joiner, the left-aligned languages, the `MM/yyyy` dates and the bold
 * certification name was asserting all of it against markup no user could ever
 * see. Two containers "identical by construction" is exactly the guarantee that
 * rots silently. There is now one container, and the table is asserted on it.
 */
export {
  buildCvDocumentBlocks,
  CV_DATE_PRESENT,
  CV_DATE_RANGE_SEPARATOR,
  CV_DOCUMENT_SECTIONS,
  CV_EDUCATION_DEGREE_JOINER,
  CV_KEYWORD_SEPARATOR,
  CV_SECTION_TITLES,
  educationDegreeLine,
  formatCvDatePeriod,
  getPopulatedCvSections,
  skillCategoryHeading,
  visibleEducation,
  visibleSkillCategories,
} from "@/components/base-cvs/cv-document-blocks";
export type {
  CvBlockKind,
  CvDocumentBlock,
  CvDocumentData,
  CvDocumentSection,
} from "@/components/base-cvs/cv-document-blocks";

/**
 * Stable DOM id on the export root, so a later exporter can find the node.
 *
 * It lands on `CvPageStack`'s `<article>` — the element that holds the ORDERED
 * LIST of sheets, not one of the sheets: a multi-page document's export root
 * cannot be one of its pages. Exactly one such node per mounted document.
 */
export const CV_DOCUMENT_EXPORT_ID = "cv-document-export-root";
