import { describe, expect, it, vi, afterEach } from "vitest";
import { readSavedAreas, southernCoordinate } from "./hemisphere";
import { lunarCircle, lunarCoordinate } from "./lunar-picking";

afterEach(() => vi.unstubAllGlobals());
describe("hemisphere exploration", () => {
  it("accepts the equator, poles and longitude seam; rejects north and invalid values", () => {
    for (const latitude_deg of [-90, -35, 0]) expect(southernCoordinate({ latitude_deg, longitude_deg_east: -180 })).toBe(true);
    for (const latitude_deg of [1, -91, NaN]) expect(southernCoordinate({ latitude_deg, longitude_deg_east: 0 })).toBe(false);
  });
  it("ignores corrupt or out-of-bounds saved areas", () => {
    vi.stubGlobal("localStorage", { getItem: () => '[null,{"latitude_deg":35,"longitude_deg_east":0},{"latitude_deg":-35,"longitude_deg_east":0}]' });
    expect(readSavedAreas()).toEqual([{ latitude_deg: -35, longitude_deg_east: 0 }]);
  });
  it.each([[-90, 0], [-35, 179.99], [0, -180]])("draws a finite 5km geodesic circle at %s,%s", (lat, lon) => {
    const circle = lunarCircle(lat, lon, 5);
    expect(circle).toHaveLength(97);
    for (const point of circle) {
      const location = lunarCoordinate(...point)!;
      const radians = Math.PI / 180;
      const cosine = Math.sin(lat * radians) * Math.sin(location.latitude_deg * radians) + Math.cos(lat * radians) * Math.cos(location.latitude_deg * radians) * Math.cos((location.longitude_deg_east - lon) * radians);
      expect(Math.acos(Math.max(-1, Math.min(1, cosine))) * 1737.4).toBeCloseTo(5, 6);
    }
  });
});
