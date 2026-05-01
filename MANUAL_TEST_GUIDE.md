# Quick Manual Test Guide

---

## Navigation Redesign (2026-05-01)

### Test 1: Inner-page nav — grouped structure
1. Open any page other than home (e.g. `/sponsors`)
2. Verify desktop nav shows: **Monitor ▾** | **Verify CoS** | **Pricing** | **Resources ▾** | Sign In | Get Alerts
3. Hover **Monitor** → dropdown shows: Sponsor Register, Sponsor Monitor, Licence Changes (each with icon + description)
4. Hover **Resources** → dropdown shows: CoS Guide, AI Guide, Technology, API Docs
5. Click a dropdown item → navigates correctly, dropdown closes
6. **Get Alerts** button: emerald green (`bg-emerald-600`)
7. Active page link has primary-color highlight

### Test 2: Home page hero nav — dark-themed dropdown
1. Open `/`
2. Nav inside gradient: same 4-group structure, white text
3. Hover **Monitor ▾** → dark slate dropdown appears with emerald hover on labels
4. Hover **Resources ▾** → same
5. **Get Alerts** button: emerald-600

### Test 3: Mobile nav
1. Resize to <1024px width
2. Hamburger menu opens a panel with three sections:
   - Monitor (with icon links)
   - Verify CoS + Pricing
   - Resources (with icon links)
3. Emerald **Get Licence Alerts** CTA at bottom
4. Sign In link visible above CTA
5. Escape key closes menu; focus returns to burger button

### Test 4: Keyboard / a11y
- Tab through nav links — all have visible focus ring
- Enter/Space on dropdown triggers open
- Escape closes dropdown

---

## Feedback System

## 🎯 Quick 5-Minute Test

### Test 1: Submit Positive Feedback (2 min)
1. **Open:** http://localhost:5000
2. **Navigate:** User Portal
3. **Upload:** Any PDF file
4. **Wait:** For verification to complete
5. **Click:** "Rate this verification" (expand form)
6. **Select:** ⭐⭐⭐⭐⭐ (5 stars)
7. **Click:** "Yes, this was helpful" button
8. **Select:** "Correct - The result matches my expectation"
9. **Type:** "This is a test comment"
10. **Click:** "Submit Feedback"
11. **✅ Success:** Toast notification appears

---

### Test 2: Submit Negative Feedback - CRITICAL (2 min)
1. **Upload:** Another PDF file
2. **Wait:** For verification
3. **Expand:** Feedback form
4. **Select:** ⭐⭐ (2 stars)
5. **Click:** "No, this wasn't helpful" ⚠️ IMPORTANT
6. **Select:** "Incorrect - The result was wrong"
7. **Select:** Any option from "What should it be?"
8. **Type:** "AI got this wrong"
9. **Click:** "Submit Feedback"
10. **✅ Success:** Toast notification appears

**Why this test is critical:** This verifies that "not helpful" (false) is properly saved, not converted to null.

---

### Test 3: View Admin Analytics (1 min)
1. **Login:** As admin user
2. **Navigate:** Admin Portal
3. **Click:** "User Feedback" tab
4. **✅ Verify:**
   - Total Feedback: 2
   - Average Rating: 3.5 stars
   - Helpful: Shows "1 helpful" (from Test 1)
   - Recent Feedback: Shows 2 entries
   
**Critical Check:** One entry should show "helpful" badge, one should NOT.

---

## 🔍 What to Look For

### ✅ Success Indicators
- [ ] No console errors
- [ ] Toast notifications appear
- [ ] Forms reset after submission
- [ ] Analytics update in real-time
- [ ] No "NaN" or "undefined" anywhere
- [ ] Star rating is clickable and visual
- [ ] Mobile responsive (try resizing browser)

### ❌ Failure Indicators
- [ ] Console errors appear
- [ ] "NaN" or "undefined" in analytics
- [ ] Both feedbacks show as "helpful" (means false→null bug)
- [ ] Can submit without selecting stars
- [ ] Analytics don't update after submission

---

## 🚨 Known Issues to Watch

### Issue 1: Boolean Preservation
**Problem:** If both Test 1 and Test 2 show "helpful" badge in admin
**Status:** ✅ FIXED (verified in code)
**What it means:** "Not helpful" was being converted to null

### Issue 2: Division by Zero
**Problem:** If empty analytics show "NaN%" 
**Status:** ✅ FIXED (verified in code)
**What it means:** Missing null guards

### Issue 3: Wrong Percentages
**Problem:** If accuracy % doesn't match (should be 50%/50% after 2 submissions)
**Status:** ✅ FIXED (verified in code)
**What it means:** Wrong denominator in calculation

---

## 📸 Expected Screenshots

### Feedback Form
```
┌─────────────────────────────────────┐
│ Help Us Improve                     │
│ Your feedback helps train our AI... │
├─────────────────────────────────────┤
│ How would you rate this?            │
│ ⭐ ⭐ ⭐ ⭐ ⭐                       │
│                                     │
│ Was this helpful?                   │
│ [Yes, this was helpful]             │
│ [No, this wasn't helpful]           │
│                                     │
│ Was the result accurate?            │
│ ○ Correct - The result matches...   │
│ ○ Incorrect - The result was wrong  │
│ ○ Unsure - I don't know             │
│                                     │
│ [Comment box]                       │
│                                     │
│ [Submit Feedback]                   │
└─────────────────────────────────────┘
```

### Admin Analytics (After 2 submissions)
```
┌────────────┬────────────┬────────────┬────────────┐
│ Total      │ Average    │ Helpful    │ Accuracy   │
│ Feedback   │ Rating     │            │            │
│            │            │            │            │
│     2      │ ⭐⭐⭐⭐☆  │  1 out of  │  Correct   │
│            │    3.5     │  2 (50%)   │    100%    │
└────────────┴────────────┴────────────┴────────────┘

Accuracy Breakdown:
▓▓▓▓▓▓▓▓▓▓ Correct: 1 (50%)
░░░░░░░░░░ Incorrect: 1 (50%)
░░░░░░░░░░ Unsure: 0 (0%)

Recent Feedback:
┌─────────────────────────────────────┐
│ ⭐⭐⭐⭐⭐ | helpful | Just now    │
│ "This is a test comment"            │
├─────────────────────────────────────┤
│ ⭐⭐ | 2 minutes ago                │
│ "AI got this wrong"                 │
└─────────────────────────────────────┘
```

---

## ✅ Test Complete!

If all 3 tests pass with no errors, the feedback system is **production ready**!

**Next Steps:**
1. ✅ Mark task as complete
2. 🚀 Deploy to production
3. 📊 Monitor real user feedback
4. 🔄 Use feedback to improve AI model
