import { test, expect } from '@playwright/test';
import { ensureE2eTestData } from '../helpers/e2eDbSeed';
import { prisma } from '@/lib/prisma';

test.describe('Checkout Process Flow - Input Validation & Edge Case E2E Tests', () => {
  let activeReservationId: string;

  test.beforeEach(async ({}, testInfo) => {
    // Seed fresh test event and unique test-isolated pending reservation in PostgreSQL
    const cleanTestTitle = testInfo.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
    activeReservationId = `res-e2e-e-${testInfo.workerIndex}-${cleanTestTitle}-${Date.now().toString(36)}`;
    await ensureE2eTestData(activeReservationId);
  });

  test('Edge Case 1: Missing mandatory inputs and terms validation on Step 2A', async ({ page }) => {
    // 1. Navigate directly to Step 2A without session storage (cold start)
    await page.goto(`/events/event-concert-1/checkout?reservationId=${activeReservationId}`);

    // Clear all text inputs to test empty submission
    await page.fill('input[placeholder="Contoh: John"]', '');
    await page.fill('input[placeholder="Contoh: Doe"]', '');
    await page.fill('input[placeholder="nama@email.com"]', '');
    await page.fill('input[placeholder="3171xxxxxxxxxxxx"]', '');
    await page.fill('input[placeholder="81234567890"]', '');

    // Uncheck terms if any
    const termsCheckbox = page.locator('input[type="checkbox"]').nth(0);
    const privacyCheckbox = page.locator('input[type="checkbox"]').nth(1);

    if (await termsCheckbox.isChecked()) await termsCheckbox.uncheck();
    if (await privacyCheckbox.isChecked()) await privacyCheckbox.uncheck();

    // Click Continue -> Should be blocked and remain on Step 2A
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout\\?reservationId=${activeReservationId}`));

    // Fill valid data but leave terms unchecked
    await page.fill('input[placeholder="Contoh: John"]', 'Ahmad');
    await page.fill('input[placeholder="Contoh: Doe"]', 'Dahlan');
    await page.fill('input[placeholder="nama@email.com"]', 'ahmad.dahlan@example.com');
    await page.fill('input[placeholder="3171xxxxxxxxxxxx"]', '3171012345678901');
    await page.fill('input[placeholder="81234567890"]', '81234567890');

    // Click Continue with terms unchecked -> Error message must appear
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');
    await expect(
      page.getByText('Anda wajib menyetujui Syarat & Ketentuan serta Kebijakan Pemrosesan Data.')
    ).toBeVisible();

    // Check Terms but leave Privacy unchecked
    await termsCheckbox.check();
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');
    await expect(
      page.getByText('Anda wajib menyetujui Syarat & Ketentuan serta Kebijakan Pemrosesan Data.')
    ).toBeVisible();

    // Check Privacy Policy -> Now should successfully navigate to Step 2B
    await privacyCheckbox.check();
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment-method.*`));
  });

  test('Edge Case 2: URL parameter validation & unauthorized direct routing', async ({ page }) => {
    // 1. Visiting Step 2A without reservationId parameter redirects to event page
    await page.goto('/events/event-concert-1/checkout');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1$`));

    // 2. Visiting Step 2A with non-existent reservationId redirects to event page
    await page.goto('/events/event-concert-1/checkout?reservationId=res-does-not-exist-999');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1$`));

    // 3. Visiting Step 2B (payment-method) without reservationId parameter redirects to event page
    await page.goto('/events/event-concert-1/checkout/payment-method');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1$`));

    // 4. Visiting Step 3 (confirmation) without reservationId parameter redirects to event page
    await page.goto('/events/event-concert-1/checkout/confirmation');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1$`));

    // 5. Visiting Step 4 (payment) without reservationId parameter redirects to event page
    await page.goto('/events/event-concert-1/checkout/payment');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1$`));
  });

  test('Edge Case 3: Payment method switching, modal cancellation and backtrack state fidelity', async ({ page }) => {
    // 1. Establish session on Step 2A
    await page.goto(`/events/event-concert-1/checkout?reservationId=${activeReservationId}`);
    await page.fill('input[placeholder="Contoh: John"]', 'Dewi');
    await page.fill('input[placeholder="Contoh: Doe"]', 'Sartika');
    await page.fill('input[placeholder="nama@email.com"]', 'dewi.sartika@example.com');
    await page.fill('input[placeholder="3171xxxxxxxxxxxx"]', '3273012345678901');
    await page.fill('input[placeholder="81234567890"]', '81398765432');

    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment-method.*`));

    // 2. Select Bank DKI / Jakarta VA option
    await page.click('label:has-text("Bank Jakarta / Bank DKI Virtual Account")');
    await page.click('button:has-text("Lanjutkan")');

    // 3. Confirm Modal Cancellation
    await expect(page.getByText('Konfirmasi Pilihan Pembayaran')).toBeVisible();
    await expect(page.locator('.fixed').getByText('Bank Jakarta / Bank DKI Virtual Account')).toBeVisible();
    await page.click('button:has-text("Ubah Pilihan")');

    // Verify modal closed and still on Step 2B
    await expect(page.getByText('Konfirmasi Pilihan Pembayaran')).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment-method.*`));

    // 4. Switch to Bank Jakarta Virtual Account and proceed
    await page.click('label:has-text("Bank Jakarta / Bank DKI Virtual Account")');
    await page.click('button:has-text("Lanjutkan")');
    await expect(page.getByText('Konfirmasi Pilihan Pembayaran')).toBeVisible();
    await page.click('button:has-text("Ya, Lanjutkan")');

    // 5. Verify Step 3 Data Fidelity (Buyer Info & Method match)
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/confirmation.*`));
    await expect(page.getByText('Dewi Sartika')).toBeVisible();
    await expect(page.getByText('dewi.sartika@example.com')).toBeVisible();
    await expect(page.getByText('3273012345678901')).toBeVisible();
    await expect(page.getByText('Bank Jakarta / Bank DKI Virtual Account', { exact: true })).toBeVisible();

    // 6. Test Backtracking: Click "Ubah Data" to return to Step 2A and verify inputs preserved
    await page.click('a:has-text("Ubah Data")');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout\\?reservationId=${activeReservationId}`));
    await expect(page.locator('input[placeholder="Contoh: John"]')).toHaveValue('Dewi');
    await expect(page.locator('input[placeholder="Contoh: Doe"]')).toHaveValue('Sartika');
    await expect(page.locator('input[placeholder="nama@email.com"]')).toHaveValue('dewi.sartika@example.com');
  });

  test('Edge Case 4: Virtual account clipboard copy and end-to-end database order state', async ({ page }) => {
    // 1. Setup full valid checkout
    await page.goto(`/events/event-concert-1/checkout?reservationId=${activeReservationId}`);
    await page.fill('input[placeholder="Contoh: John"]', 'Raden');
    await page.fill('input[placeholder="Contoh: Doe"]', 'Ajeng');
    await page.fill('input[placeholder="nama@email.com"]', 'kartini@example.com');
    await page.fill('input[placeholder="3171xxxxxxxxxxxx"]', '3320012345678901');
    await page.fill('input[placeholder="81234567890"]', '81122334455');

    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');

    // Select Bank Jakarta VA
    await page.click('label:has-text("Bank Jakarta / Bank DKI Virtual Account")');
    await page.click('button:has-text("Lanjutkan")');
    await page.click('button:has-text("Ya, Lanjutkan")');

    // Step 3 -> Proceed to Step 4
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/confirmation.*`));
    await page.click('button:has-text("Bayar Sekarang")');

    // Step 4
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment.*`));
    await expect(page.getByText('Nomor Virtual Account')).toBeVisible();

    // Verify Copy VA Button
    const copyBtn = page.locator('button:has-text("Salin")');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(page.getByText('Tersalin')).toBeVisible();

    // Simulate Payment
    await page.click('button:has-text("Simulasikan Pembayaran Berhasil")');
    await expect(page.getByText('Pembayaran Berhasil!')).toBeVisible();
    await expect(page.getByText('Kode Booking')).toBeVisible();

    // Verify PostgreSQL Database Records
    const dbReservation = await prisma.reservation.findUnique({
      where: { id: activeReservationId },
      include: { orders: true, seats: { include: { seat: true } } },
    });

    expect(dbReservation).not.toBeNull();
    expect(dbReservation?.status).toBe('CONFIRMED');
    expect(dbReservation?.orders.length).toBeGreaterThan(0);

    const dbOrder = dbReservation?.orders[0];
    expect(dbOrder?.customerName).toBe('Raden Ajeng');
    expect(dbOrder?.customerEmail).toBe('kartini@example.com');
    expect(dbOrder?.paymentStatus).toBe('PAID');
    expect(dbOrder?.totalAmount).toBe(150000);

    // Verify Seat status is now RESERVED
    for (const rs of dbReservation?.seats || []) {
      expect(rs.seat.status).toBe('RESERVED');
    }
  });
});
