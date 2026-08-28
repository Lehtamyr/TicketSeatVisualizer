import { test, expect } from '@playwright/test';
import { ensureE2eTestData } from '../helpers/e2eDbSeed';

test.describe('Complete Multi-Page Ticket Purchase & Checkout Flow E2E Tests', () => {
  let activeReservationId: string;

  test.beforeEach(async ({}, testInfo) => {
    // Seed fresh test event and unique test-isolated pending reservation in PostgreSQL
    const cleanTestTitle = testInfo.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
    activeReservationId = `res-e2e-f-${testInfo.workerIndex}-${cleanTestTitle}-${Date.now().toString(36)}`;
    await ensureE2eTestData(activeReservationId);
  });

  test('Complete End-to-End Flow: from Checkout Form to Payment Simulation and Success Modal', async ({ page }) => {
    // Navigate directly to Step 2A (Checkout form) with active reservationId in database
    await page.goto(`/events/event-concert-1/checkout?reservationId=${activeReservationId}`);

    // 1. Verify Step 2A Journey Tracker
    await expect(page.getByText('Pilih Kursi')).toBeVisible();
    await expect(page.getByText('Informasi', { exact: true })).toBeVisible();
    await expect(page.getByText('Data Pembeli', { exact: true })).toBeVisible();

    // 2. Fill out Buyer Information Form
    await page.fill('input[placeholder="Contoh: John"]', 'Ahmad');
    await page.fill('input[placeholder="Contoh: Doe"]', 'Dahlan');
    await page.fill('input[placeholder="nama@email.com"]', 'ahmad.dahlan@example.com');
    await page.fill('input[placeholder="3171xxxxxxxxxxxx"]', '3171012345678901');
    await page.fill('input[placeholder="81234567890"]', '81234567890');

    // Agree to mandatory terms
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }

    // Click "Lanjut ke Metode Pembayaran" -> Navigates to Step 2B
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');

    // 3. Verify Step 2B: Payment Method Page
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment-method.*`));
    await expect(page.getByText('Metode Pembayaran', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pilih Metode Pembayaran' })).toBeVisible();

    // Verify solid brand badges are rendered
    await expect(page.getByText('QRIS STANDAR')).toBeVisible();
    await expect(page.getByText('BANK DKI / JAKARTA')).toBeVisible();

    // Select Bank Jakarta Virtual Account option
    await page.click('label:has-text("Bank Jakarta / Bank DKI Virtual Account")');

    // Click "Lanjutkan" to trigger confirmation popup
    await page.click('button:has-text("Lanjutkan")');

    // Verify Confirmation Modal
    await expect(page.getByText('Konfirmasi Pilihan Pembayaran')).toBeVisible();
    await page.click('button:has-text("Ya, Lanjutkan")');

    // 4. Verify Step 3: Confirmation Page
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/confirmation.*`));
    await expect(page.getByText('Konfirmasi', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Informasi Pembeli' })).toBeVisible();
    await expect(page.getByText('Ahmad Dahlan')).toBeVisible();
    await expect(page.getByText('Bank Jakarta / Bank DKI Virtual Account', { exact: true })).toBeVisible();

    // Click "Bayar Sekarang" -> Navigates to Step 4
    await page.click('button:has-text("Bayar Sekarang")');

    // 5. Verify Step 4: Payment Instructions & Mock Execution
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment.*`));
    await expect(page.getByText('Pembayaran', { exact: true })).toBeVisible();
    await expect(page.getByText('Nomor Virtual Account')).toBeVisible();
    await expect(page.getByText('Simulasikan Pembayaran Berhasil')).toBeVisible();

    // Trigger mock payment simulation
    await page.click('button:has-text("Simulasikan Pembayaran Berhasil")');

    // 6. Verify Payment Success Modal
    await expect(page.getByText('Pembayaran Berhasil!')).toBeVisible();
    await expect(page.getByText('Kembali ke Halaman Event')).toBeVisible();

    // Return to Event Page
    await page.click('button:has-text("Kembali ke Halaman Event")');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1$`));
  });

  test('QRIS Payment Flow: validates dynamic QR code and instructions', async ({ page }) => {
    // Navigate to step 2A to establish cookies and valid session context
    await page.goto(`/events/event-concert-1/checkout?reservationId=${activeReservationId}`);
    await page.fill('input[placeholder="Contoh: John"]', 'Ahmad');
    await page.fill('input[placeholder="Contoh: Doe"]', 'Dahlan');
    await page.fill('input[placeholder="nama@email.com"]', 'ahmad.dahlan@example.com');
    await page.fill('input[placeholder="3171xxxxxxxxxxxx"]', '3171012345678901');
    await page.fill('input[placeholder="81234567890"]', '81234567890');

    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.click('button:has-text("Lanjut ke Metode Pembayaran")');
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment-method.*`));

    // Select QRIS and proceed through confirmation
    await page.click('label:has-text("QRIS")');
    await page.click('button:has-text("Lanjutkan")');
    await page.click('button:has-text("Ya, Lanjutkan")');

    // Step 3 Confirmation
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/confirmation.*`));
    await page.click('button:has-text("Bayar Sekarang")');

    // Step 4 Payment
    await expect(page).toHaveURL(new RegExp(`/events/event-concert-1/checkout/payment.*`));
    await expect(page.getByText('Pembayaran QRIS Bank Jakarta')).toBeVisible();
    await expect(page.getByText('TSV · QRIS PAY')).toBeVisible();
    await expect(page.getByText('Petunjuk Pembayaran QRIS:')).toBeVisible();
    await expect(page.getByText('SEATING NUMBERS TICKET INCLUDES GOVERNMENT FEE 10% AND PLATFORM FEE 5%')).toBeVisible();

    // Simulate Payment
    await page.click('button:has-text("Simulasikan Pembayaran Berhasil")');
    await expect(page.getByText('Pembayaran Berhasil!')).toBeVisible();

    // Verify Download E-Ticket PDF button is visible and triggers download
    const downloadBtn = page.getByRole('button', { name: 'Unduh E-Ticket (PDF)' });
    await expect(downloadBtn).toBeVisible();
  });
});
