# Feedback System — Static Code Review

**Review date:** November 16, 2025
**Path references verified:** August 24, 2026
**Method:** Manual code inspection. **No automated tests were written or executed for the
feedback system** — there is no `feedback*.test.ts` in the suite. The findings below record
that four specific defects were located and corrected in source; they are *not* test results
and do not constitute evidence the feature works end-to-end at runtime.

> **To actually verify this feature**, follow [Manual Testing](#manual-testing) below, or
> write Vitest coverage under `server/repositories/__tests__/` and
> `client/src/components/__tests__/`. Until then the feedback path is unverified by CI.

---

## Defects found and corrected

### 1. Boolean coercion dropped `false`

**Location:** `client/src/components/FeedbackForm.tsx:63`

```typescript
// Before — `||` treats false as falsy and substitutes null
helpful: helpful || null

// After
helpful: helpful === null ? null : helpful
```

Effect: selecting "not helpful" was stored as `null` (no answer) instead of `false`.

---

### 2. `NaN` in analytics aggregates

**Location:** `server/repositories/feedbackRepository.ts:56-62`
*(previously in `server/storage.ts`; that file is now a thin delegating facade —
`storage.getFeedbackStats()` at line 181 forwards to the repository.)*

SQL aggregate results are returned as strings (or `null` on an empty table) by the driver,
so arithmetic on them produced `NaN`. Each field is now wrapped:

```typescript
totalFeedback: Number(totalCount.count) || 0,
averageRating: Number(avgRating.average) || 0,
helpfulCount:  Number(helpfulCount.count) || 0,
accuracyBreakdown: {
  correct:   Number(correctCount.count) || 0,
  incorrect: Number(incorrectCount.count) || 0,
  unsure:    Number(unsureCount.count) || 0,
},
```

---

### 3. Wrong denominator in accuracy percentage

**Location:** `client/src/components/FeedbackAnalytics.tsx:44-47`

Accuracy was divided by *all* feedback rather than by responses that actually answered the
accuracy question, understating the figure whenever a user submitted a rating without one.

```typescript
const totalAccuracyResponses =
  (stats.accuracyBreakdown.correct || 0) +
  (stats.accuracyBreakdown.incorrect || 0) +
  (stats.accuracyBreakdown.unsure || 0);

const accuracyPercentage = totalAccuracyResponses > 0
  ? Math.round((stats.accuracyBreakdown.correct / totalAccuracyResponses) * 100)
  : 0;
```

---

### 4. Unguarded `.toFixed()` on a nullable rating

**Location:** `client/src/components/FeedbackAnalytics.tsx:54`

```typescript
const displayRating =
  typeof stats.averageRating === 'number' && !isNaN(stats.averageRating)
    ? stats.averageRating
    : 0;
```

---

## Related code

| Concern | Location |
|---|---|
| Submit feedback | `POST /api/feedback` — `server/routes/feedback.ts:18` (rate-limited) |
| Feedback stats | `GET /api/feedback/stats` — `server/routes/admin.ts:1470` (admin only) |
| Data access | `server/repositories/feedbackRepository.ts` |
| Storage facade | `server/storage.ts:181` |
| Submit form | `client/src/components/FeedbackForm.tsx` |
| Analytics view | `client/src/components/FeedbackAnalytics.tsx` |

---

## Manual testing

Runtime behaviour is unverified by automation — these steps are currently the only
evidence available. See also [FEEDBACK_TESTING.md](FEEDBACK_TESTING.md).

1. **Positive path** — verify a document, rate 5 stars, mark helpful, accuracy "correct",
   add a comment, submit. Expect a success toast.
2. **Negative path (covers defect 1)** — submit 2 stars with **"No, this wasn't helpful"**
   and accuracy "incorrect". Then check admin analytics: this entry must show
   `helpful = false`, *not* blank/null.
3. **Admin analytics** — Admin Portal → User Feedback. With the two entries above expect
   Total 2, Average 3.5, Helpful 1/2 (50%), Correct 100%.
4. **Empty state (covers defects 2 and 4)** — view analytics against a database with no
   feedback rows. Every metric must render `0`, never `NaN` or blank.
5. **Partial submission (covers defect 3)** — submit a rating with no accuracy answer, then
   confirm the accuracy percentage ignores it rather than counting it as incorrect.

---

## Notes

- `||` substitutes the right operand for *any* falsy value, `false` and `0` included. Use an
  explicit `=== null` check for nullable booleans.
- Wrap SQL aggregate results in `Number(...) || 0` — the driver returns strings, and `null`
  on empty tables.
- Percentages should divide by the count of applicable responses, not the total record count.
