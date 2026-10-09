import type { Page } from '@playwright/test';

export async function readMapView(page: Page) {
  return page.evaluate(() => {
    const map = document.querySelector('.leaflet-container');
    if (!map) return null;
    const bounds = map.getBoundingClientRect();
    const tiles = [
      ...map.querySelectorAll<HTMLImageElement>('.leaflet-tile-loaded'),
    ]
      .map((image) => {
        const match = image.src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
        const rectangle = image.getBoundingClientRect();
        return match && rectangle.width > 0
          ? {
              zoom: Number(match[1]),
              x: Number(match[2]),
              y: Number(match[3]),
              rectangle,
            }
          : null;
      })
      .filter((tile) => tile !== null)
      .sort((first, second) => second.zoom - first.zoom);
    const tile = tiles[0];
    if (!tile) return null;

    const worldSize = 256 * 2 ** tile.zoom;
    const worldX =
      tile.x * 256 +
      ((bounds.left + bounds.width / 2 - tile.rectangle.left) /
        tile.rectangle.width) *
        256;
    const worldY =
      tile.y * 256 +
      ((bounds.top + bounds.height / 2 - tile.rectangle.top) /
        tile.rectangle.height) *
        256;
    return {
      zoom: tile.zoom + Math.log2(tile.rectangle.width / 256),
      longitude: (worldX / worldSize) * 360 - 180,
      latitude:
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / worldSize))) * 180) /
        Math.PI,
    };
  });
}
