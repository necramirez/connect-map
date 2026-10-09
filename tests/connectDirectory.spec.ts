import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  summarizeConnectDetails,
  type ConnectDetails,
} from '../src/lib/connectDirectory';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

async function readDirectory(): Promise<ConnectDetails[]> {
  return JSON.parse(
    await readFile('dist/connect-directory.json', 'utf8'),
  ) as ConnectDetails[];
}

test('summarizes directory fields without copying addresses or other private data', () => {
  const location = {
    name: ' Families Group ',
    suburb: ' Newington ',
    state: 'NSW',
    postcode: 2127,
    demographic: ['Adults', '??'],
    schedule: ['Thursday', '19:00:00'],
    address1: 'Private address',
    phone: 'Private phone',
    secret: 'Private secret',
  };
  expect(summarizeConnectDetails(location)).toEqual({
    name: 'Families Group',
    suburb: 'Newington',
    state: 'NSW',
    postcode: '2127',
    demographics: ['Adults'],
    schedule: 'Thursday · 19:00:00',
  });
});

test('uses empty fields for unknown directory details', () => {
  expect(
    summarizeConnectDetails({
      name: '',
      suburb: '??',
      state: 'unknown',
      postcode: null,
      demographic: ['??'],
      schedule: ['??', null],
    }),
  ).toEqual({
    name: 'Unnamed connect',
    suburb: '',
    state: '',
    postcode: '',
    demographics: [],
    schedule: '',
  });
});

test('publishes every source connect with only approved directory fields', async () => {
  const source = JSON.parse(await readFile('data/connects.json', 'utf8')) as {
    locations: Record<string, unknown>[];
  };
  const directory = await readDirectory();
  expect(directory).toEqual(source.locations.map(summarizeConnectDetails));
  for (const connect of directory) {
    expect(Object.keys(connect).sort()).toEqual([
      'demographics',
      'name',
      'postcode',
      'schedule',
      'state',
      'suburb',
    ]);
  }
});

test.describe('directory dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: transparentTile }),
    );
  });

  test('loads all rows on demand, closes with Escape, and restores focus', async ({
    page,
  }) => {
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/connect-directory.json')) requests++;
    });
    await page.goto('./');
    await expect(
      page.getByRole('region', { name: 'Interactive map' }),
    ).toBeVisible();
    const button = page.getByRole('button', {
      name: 'All connects',
      exact: true,
    });
    await expect(button).toBeVisible();
    expect(requests).toBe(0);
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'All connects' });
    await expect(dialog).toBeVisible();
    const directory = await readDirectory();
    await expect(dialog.locator('tbody tr')).toHaveCount(directory.length);
    await expect(dialog.getByRole('columnheader')).toHaveText([
      'Name',
      'Suburb',
      'State',
      'Postcode',
      'Demographics',
      'Schedule',
    ]);
    const cells = await dialog
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) =>
          [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
        ),
      );
    expect(cells).toEqual(
      directory.map((connect) => [
        connect.name,
        connect.suburb || '—',
        connect.state || '—',
        connect.postcode || '—',
        connect.demographics.join(', ') || '—',
        connect.schedule || '—',
      ]),
    );
    await expect(dialog.getByRole('status')).toHaveText(
      `${directory.length} connects`,
    );
    expect(requests).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const extent = await dialog
      .locator('.directory-table-scroll')
      .evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        height: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
    expect(extent.scrollHeight).toBeGreaterThan(extent.height);
    if ((page.viewportSize()?.width ?? 0) < 850) {
      expect(extent.scrollWidth).toBeGreaterThan(extent.width);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    await button.click();
    await expect(dialog.locator('tbody tr')).toHaveCount(directory.length);
    expect(requests).toBe(1);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('searches connect details and handles no matching rows', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(
      page.getByRole('region', { name: 'Interactive map' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'All connects', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'All connects' });
    const search = dialog.getByRole('searchbox', { name: 'Search connects' });
    await expect(search).toBeVisible();
    const directory = await readDirectory();
    const expected = directory.filter((connect) =>
      [
        connect.name,
        connect.suburb,
        connect.state,
        connect.postcode,
        ...connect.demographics,
        connect.schedule,
      ]
        .join(' ')
        .toLowerCase()
        .includes('newington'),
    );
    await search.fill('NEWINGTON');
    await expect(dialog.locator('tbody tr')).toHaveCount(expected.length);
    await expect(dialog.getByRole('status')).toHaveText(
      `${expected.length} of ${directory.length} connects`,
    );
    await search.fill('no-such-connect-xyz');
    await expect(
      dialog.getByText('No connects match your search.'),
    ).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText(
      `0 of ${directory.length} connects`,
    );
    await search.fill('');
    await expect(dialog.locator('tbody tr')).toHaveCount(directory.length);
  });

  for (const failure of ['request', 'invalid data', 'invalid row'] as const) {
    test(`can retry after a directory ${failure} failure`, async ({ page }) => {
      let requests = 0;
      const directory = await readDirectory();
      await page.route('**/connect-directory.json', (route) => {
        requests++;
        return route.fulfill(
          requests === 1
            ? failure === 'request'
              ? { status: 503, body: 'Unavailable' }
              : {
                  contentType: 'application/json',
                  body:
                    failure === 'invalid data' ? '{"invalid":true}' : '[{}]',
                }
            : {
                contentType: 'application/json',
                body: JSON.stringify(directory),
              },
        );
      });
      await page.goto('./');
      await expect(
        page.getByRole('region', { name: 'Interactive map' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'All connects', exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: 'All connects' });
      await expect(dialog.getByRole('alert')).toHaveText(
        'Connect list unavailable.',
      );
      await dialog.getByRole('button', { name: 'Retry' }).click();
      await expect(dialog.locator('tbody tr')).toHaveCount(directory.length);
      expect(requests).toBe(2);
    });
  }
});
