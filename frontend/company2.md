# Plan: Refactor `company_id` → `company` with union type in ApplicationFormSheet

## Context

The current form stores only a string company ID (`company_id`). The goal is to support two distinct
submission shapes:
- **Existing company selected**: `{ company: number }` — the ID received from `CompanySelect.onSelect`
- **New company created**: `{ company: { name: string, url: string } }` — name typed by user + optional URL

When the user triggers "create new" in `CompanySelect`, a URL input should appear below the component
so the user can optionally provide the company website. Invalid URLs should surface an inline error.

---

## Files to Modify

| File | Why |
|------|-----|
| `src/components/shared/application-form-sheet.tsx` | Schema, state, handlers, JSX |
| `src/services/types/applications.ts` | `CreateApplicationPayload` shape |

---

## 1. Update `CreateApplicationPayload` type

**File:** `src/services/types/applications.ts`

```diff
 export interface CreateApplicationPayload {
-  company_id: string;
+  company: number | { name: string; url: string };
   platform_id: string;
   ...
 }
```

---

## 2. Update Zod Schema

**File:** `src/components/shared/application-form-sheet.tsx` — lines 58–108

Replace:
```ts
company_id: z.string().min(1, "Company is required"),
```

With:
```ts
company: z.union([
  z.number({ error: "Company is required" }),
  z.object({
    name: z.string().min(1, "Company name is required"),
    url: z.union([
      z.literal(""),
      z.httpUrl({ error: "Invalid url." }),
    ]),
  }),
]),
```

`z.union` ensures at least one valid branch is present; neither branch accepts `undefined`,
so "company required" validation is preserved.

---

## 3. Update `buildDefaultValues`

**File:** `src/components/shared/application-form-sheet.tsx` — lines 118–136

```diff
-  company_id: application?.company.id ?? "",
+  company: application?.company.id ? Number(application.company.id) : (undefined as unknown as number),
```

> Note: `Number()` converts the existing string ID to a number, matching the new schema branch.

---

## 4. Add "create new" state

Below the existing `useWatch` calls, add:

```ts
const [showUrlInput, setShowUrlInput] = React.useState(false);
```

Reset it alongside the form reset in the `useEffect`:
```ts
useEffect(() => {
  setShowUrlInput(false);
  if (application) { form.reset(buildDefaultValues(application)); }
  else { form.reset(); }
}, [application, open, form]);
```

---

## 5. Update `hasValidCompany` derivation

Replace line 168–169:
```diff
-const companyId = useWatch({ control: form.control, name: "company_id" });
-const hasValidCompany = !!companyId;
+const company = useWatch({ control: form.control, name: "company" });
+const hasValidCompany =
+  typeof company === "number" ||
+  (typeof company === "object" && !!company?.name);
```

---

## 6. Update `CompanySelect` callbacks

**onSelect** — existing company chosen, store ID as number and hide URL input:
```ts
onSelect={(company) => {
  setShowUrlInput(false);
  form.setValue("company", company ? Number(company.id) : (undefined as unknown as number), {
    shouldValidate: true,
  });
}}
```

**onCreateNew** — new company option clicked, set object shape and reveal URL input:
```ts
onCreateNew={(input) => {
  setShowUrlInput(true);
  form.setValue("company", { name: input, url: "" }, { shouldValidate: false });
}}
```

---

## 7. Update JSX — error display + URL input

Replace the current error block (lines 246–250):
```diff
-{form.formState.errors.company_id && (
+{form.formState.errors.company && !showUrlInput && (
   <p className="mt-1 text-xs text-destructive">
-    {form.formState.errors.company_id.message}
+    {form.formState.errors.company?.message}
   </p>
 )}
```

Add URL input **below** the CompanySelect block (after the error paragraph), rendered when `showUrlInput` is true:

```tsx
{showUrlInput && (
  <div className="space-y-1.5">
    <Label>Company URL</Label>
    <Input
      {...form.register("company.url")}
      placeholder="https://company.com (optional)"
      className={cn(
        (form.formState.errors.company as { url?: { message?: string } })?.url &&
          "border-destructive focus-visible:ring-destructive",
      )}
    />
    {(form.formState.errors.company as { url?: { message?: string } })?.url && (
      <p className="text-xs text-destructive">
        {(form.formState.errors.company as { url?: { message?: string } })?.url?.message}
      </p>
    )}
  </div>
)}
```

> The cast is needed because `form.formState.errors.company` is typed as the union error,
> which doesn't directly expose `.url`. A helper accessor or type assertion keeps it clean.

---

## 8. Update `onSubmit` payload

Lines 204–224:

```diff
 const payload: CreateApplicationPayload = {
-  company_id: data.company_id,
+  company: data.company,
   platform_id: data.platform_id,
   ...
 };
```

---

## Verification

1. **Select existing company** → `showUrlInput` stays `false`, form fields enable, submit sends `company: <number>`.
2. **Click "create new"** → URL input appears below CompanySelect, form fields enable (hasValidCompany is true because name is set).
3. **Type invalid URL** (e.g. `not-a-url`) → error message "Invalid url." appears below the URL input.
4. **Type valid URL or leave blank** → no URL error, form submits with `company: { name, url }`.
5. **Select existing after create-new flow** → URL input hides, company resets to number.
6. **Edit existing application** → company is pre-populated as a number from the stored ID.
