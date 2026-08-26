// Real business registration details, sourced from the user before ship.
// Do not fabricate these. Values are null until real data is supplied — the
// hero trust strip (HeroSection.tsx) and Footer.tsx conditionally render each
// field and hide it entirely while null, rather than showing placeholder text
// to live visitors (a visible "[PENDING]" reads as broken, not trustworthy).
export const COMPANY_DETAILS: {
  companyNumber: string | null;
  registeredOffice: string | null;
  icoRegistration: string | null;
} = {
  companyNumber: null,
  registeredOffice: null,
  icoRegistration: null,
};
