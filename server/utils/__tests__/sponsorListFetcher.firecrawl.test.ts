import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const scrapeMock = vi.hoisted(() => vi.fn());
const ctorMock = vi.hoisted(() => vi.fn());

// Mirrors the v2+ SDK: default export is a client whose scrape() resolves to the
// Document itself (no `success` flag) and rejects on failure.
vi.mock("@mendable/firecrawl-js", () => ({
  default: class {
    constructor(opts: unknown) {
      ctorMock(opts);
    }
    scrape = scrapeMock;
  },
}));

import { discoverCsvUrl } from "../sponsorListFetcher";

describe("discoverCsvUrl via Firecrawl", () => {
  const originalKey = process.env.FIRECRAWL_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIRECRAWL_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = originalKey;
  });

  it("returns the CSV link found in the scraped markdown", async () => {
    scrapeMock.mockResolvedValue({
      markdown:
        "Download [the register](https://assets.publishing.service.gov.uk/media/x/2026-09-29_Worker_and_Temporary_Worker.csv) today",
    });

    const url = await discoverCsvUrl();

    expect(url).toBe("https://assets.publishing.service.gov.uk/media/x/2026-09-29_Worker_and_Temporary_Worker.csv");
    expect(ctorMock).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(scrapeMock).toHaveBeenCalledWith(expect.stringContaining("gov.uk"), { formats: ["markdown"] });
  });
});
