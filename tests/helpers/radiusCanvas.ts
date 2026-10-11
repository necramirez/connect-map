import type { Page } from '@playwright/test';

export async function readRadiusCanvas(page: Page) {
  const canvas = page.locator('.leaflet-suburb-radius-pane canvas');
  if ((await canvas.count()) === 0) return null;
  return canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minimumColumn = Infinity;
    let maximumColumn = -Infinity;
    let minimumRow = Infinity;
    let maximumRow = -Infinity;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        (pixels[index + 3] ?? 0) < 180 ||
        Math.abs((pixels[index] ?? 0) - 37) > 7 ||
        Math.abs((pixels[index + 1] ?? 0) - 99) > 7 ||
        Math.abs((pixels[index + 2] ?? 0) - 235) > 7
      )
        continue;
      const column = (index / 4) % canvas.width;
      const row = Math.floor(index / 4 / canvas.width);
      minimumColumn = Math.min(minimumColumn, column);
      maximumColumn = Math.max(maximumColumn, column);
      minimumRow = Math.min(minimumRow, row);
      maximumRow = Math.max(maximumRow, row);
    }
    if (!Number.isFinite(minimumColumn)) return null;
    const bounds = canvas.getBoundingClientRect();
    const scale = bounds.width / canvas.width;
    return {
      centerX: bounds.left + ((minimumColumn + maximumColumn) / 2) * scale,
      centerY: bounds.top + ((minimumRow + maximumRow) / 2) * scale,
      radiusPixels: ((maximumColumn - minimumColumn) / 2) * scale,
      verticalRadiusPixels: ((maximumRow - minimumRow) / 2) * scale,
    };
  });
}
