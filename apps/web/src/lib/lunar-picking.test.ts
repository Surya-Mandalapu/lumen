import { describe, expect, it } from "vitest";
import { lunarCoordinate, lunarPoint } from "./lunar-picking";
import { projectPolar, unprojectPolar } from "./coverage";
describe("3D point picking", () => {
  it.each([[-89.9, 0], [-87, 90], [0, -179.9], [45, -90], [-90, 0]])("round trips lunar coordinates %s, %s", (latitude, longitude) => {
    const point = lunarPoint(latitude, longitude);
    const coordinate = lunarCoordinate(...point)!;
    expect(coordinate.latitude_deg).toBeCloseTo(latitude, 7);
    expect(coordinate.longitude_deg_east).toBeCloseTo(longitude, 7);
  });
  it("uses the same longitude direction as the south-pole terrain projection", () => {
    const [x, y] = projectPolar(-89, 90);
    const coordinate = unprojectPolar(x, y);
    const moon = lunarPoint(coordinate.latitude_deg, coordinate.longitude_deg_east);
    expect(moon[0]).toBeGreaterThan(0);
    expect(moon[1]).toBeLessThan(0);
    expect(moon[2]).toBeCloseTo(0);
    expect(lunarCoordinate(0, 0, 0)).toBeNull();
    expect(lunarCoordinate(Infinity, 0, 0)).toBeNull();
  });
});
