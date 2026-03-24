import { describe, it, expect, afterEach } from "vitest";
import { getAppUrl } from "../appUrl";

describe("getAppUrl", () => {
  const originalUrl = process.env.APP_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = originalUrl;
    }
  });

  it("defaults to https://checkbyai.net when APP_URL is not set", () => {
    delete process.env.APP_URL;
    expect(getAppUrl()).toBe("https://checkbyai.net");
  });

  it("returns APP_URL when set", () => {
    process.env.APP_URL = "https://staging.checkbyai.net";
    expect(getAppUrl()).toBe("https://staging.checkbyai.net");
  });

  it("strips a single trailing slash", () => {
    process.env.APP_URL = "https://staging.checkbyai.net/";
    expect(getAppUrl()).toBe("https://staging.checkbyai.net");
  });

  it("strips multiple trailing slashes", () => {
    process.env.APP_URL = "http://localhost:5000///";
    expect(getAppUrl()).toBe("http://localhost:5000");
  });

  it("does not modify URLs without trailing slash", () => {
    process.env.APP_URL = "http://localhost:5000";
    expect(getAppUrl()).toBe("http://localhost:5000");
  });
});
