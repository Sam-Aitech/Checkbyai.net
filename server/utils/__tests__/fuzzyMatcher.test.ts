import { describe, it, expect } from "vitest";
import { 
  areCompaniesFuzzyMatch, 
  reconcileAdditionsDeletions,
  DEFAULT_FUZZY_CONFIG,
  type CompanyRecord
} from "../fuzzyMatcher";

describe("fuzzyMatcher", () => {
  describe("areCompaniesFuzzyMatch", () => {
    it("should match exact identical companies", () => {
      const prev: CompanyRecord = {
        organisationName: "Tech Corp Ltd",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-1"
      };
      
      // Different fingerprint, same other details
      const curr: CompanyRecord = {
        organisationName: "Tech Corp Ltd",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-2"
      };

      expect(areCompaniesFuzzyMatch(prev, curr)).toBe(true);
    });

    it("should match companies with minor name differences (LTD vs Limited)", () => {
      const prev: CompanyRecord = {
        organisationName: "Tech Corp LTD",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-1"
      };
      
      const curr: CompanyRecord = {
        organisationName: "Tech Corp Limited",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-2"
      };

      expect(areCompaniesFuzzyMatch(prev, curr)).toBe(true);
    });

    it("should not match companies with completely different names", () => {
      const prev: CompanyRecord = {
        organisationName: "Alpha Solutions",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-1"
      };
      
      const curr: CompanyRecord = {
        organisationName: "Beta Services",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-2"
      };

      expect(areCompaniesFuzzyMatch(prev, curr)).toBe(false);
    });
    
    it("should not match if route differs (when requireExactRoute is true)", () => {
      const prev: CompanyRecord = {
        organisationName: "Tech Corp Ltd",
        townCity: "London",
        route: "Skilled Worker",
        fingerprint: "some-hash-1"
      };
      
      const curr: CompanyRecord = {
        organisationName: "Tech Corp Ltd",
        townCity: "London",
        route: "Global Business Mobility",
        fingerprint: "some-hash-2"
      };

      expect(areCompaniesFuzzyMatch(prev, curr)).toBe(false);
    });
  });

  describe("reconcileAdditionsDeletions", () => {
    it("should pair up orphaned additions and deletions representing the same company", () => {
      const additions: CompanyRecord[] = [
        {
          organisationName: "Tech Corp Limited",
          townCity: "London",
          route: "Skilled Worker",
          fingerprint: "some-hash-2"
        },
        {
          organisationName: "Brand New Co",
          townCity: "Manchester",
          route: "Skilled Worker",
          fingerprint: "some-hash-3"
        }
      ];

      const deletions: CompanyRecord[] = [
        {
          organisationName: "Tech Corp LTD",
          townCity: "London",
          route: "Skilled Worker",
          fingerprint: "some-hash-1"
        },
        {
          organisationName: "Old Co Closed",
          townCity: "Birmingham",
          route: "Skilled Worker",
          fingerprint: "some-hash-4"
        }
      ];

      const result = reconcileAdditionsDeletions(additions, deletions);

      expect(result.matches.length).toBe(1);
      expect(result.matches[0].previous.organisationName).toBe("Tech Corp LTD");
      expect(result.matches[0].current.organisationName).toBe("Tech Corp Limited");
      
      // Should remove the paired records from unresolved lists
      expect(result.additions.length).toBe(1);
      expect(result.additions[0].organisationName).toBe("Brand New Co");
      
      expect(result.deletions.length).toBe(1);
      expect(result.deletions[0].organisationName).toBe("Old Co Closed");
    });
  });
});
