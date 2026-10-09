import type { Page } from '@playwright/test';

export async function findSuburbPoint(page: Page, highlighted = false) {
  return page
    .locator('.leaflet-overlay-pane canvas')
    .evaluate((element, highlighted) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      const map = canvas.closest('.leaflet-container');
      if (!context || !map) throw new Error('Suburb canvas is unavailable.');
      const bounds = canvas.getBoundingClientRect();
      const mapBounds = map.getBoundingClientRect();
      const scale = canvas.width / bounds.width;
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;

      for (
        let y = mapBounds.top + mapBounds.height * 0.2;
        y < mapBounds.top + mapBounds.height * 0.45;
        y += 4
      ) {
        for (
          let x = mapBounds.left + mapBounds.width * 0.25;
          x < mapBounds.left + mapBounds.width * 0.75;
          x += 4
        ) {
          const column = Math.floor((x - bounds.left) * scale);
          const row = Math.floor((y - bounds.top) * scale);
          const index = (row * canvas.width + column) * 4;
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          const matches = highlighted
            ? alpha >= 65 && alpha <= 100 && red > green
            : alpha >= 15 &&
              alpha <= 30 &&
              Math.max(red, green, blue) - Math.min(red, green, blue) <= 40;
          if (matches) return { x, y };
        }
      }
      return null;
    }, highlighted);
}
