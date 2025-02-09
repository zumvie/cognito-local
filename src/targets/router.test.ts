import { MockLogger } from "../__tests__/mockLogger";
import { UnsupportedError } from "../errors";
import { Services } from "../services";
import { Router, Targets } from "./router";

describe("Router", () => {
  it("returns an error handler for an invalid target", async () => {
    const services = {} as Services;
    const route = Router(services, MockLogger)("invalid");

    await expect(route(null as any)).rejects.toEqual(
      new UnsupportedError('Unsupported x-amz-target header "invalid"')
    );
  });

  it.each(Object.keys(Targets))("supports the %s target", (target) => {
    const services = {} as Services;
    const route = Router(services, MockLogger)(target);

    expect(route).toBeDefined();
  });
});
