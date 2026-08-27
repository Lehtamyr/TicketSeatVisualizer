import { describe, it, expect } from 'vitest';
import { generateTicketsPdf, generateTicketBarcodeBuffer } from '@/lib/pdf/ticketPdfGenerator';

describe('Ticket PDF Generator', () => {
  it('generates a valid barcode PNG buffer', async () => {
    const buffer = await generateTicketBarcodeBuffer('TSV202689412101');
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);
    // Check PNG header (0x89 0x50 0x4E 0x47)
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4E);
    expect(buffer[3]).toBe(0x47);
  });

  it('generates a valid multi-ticket PDF buffer matching layout structure', async () => {
    const pdfBuffer = await generateTicketsPdf({
      orderNumber: 'TSV-2026-99124',
      orderDate: new Date('2026-06-07T15:00:00Z'),
      customerName: 'Graciela Irene Turangan',
      customerEmail: 'graciela@example.com',
      event: {
        title: 'Home Sweet Loan Gala Premiere',
        venueName: 'Grand Theater Jakarta',
        startTime: new Date('2026-06-07T15:00:00Z'),
        termsAndConditions: 'Sample event terms and conditions for testing purposes.',
      },
      seats: [
        {
          seatId: 'seat-test-001',
          row: 'A',
          number: 14,
          sectionName: 'Main Orchestra',
          sectionCode: 'ORCH-A',
          tierName: 'VIP',
          price: 150000,
        },
        {
          seatId: 'seat-test-002',
          row: 'A',
          number: 15,
          sectionName: 'Main Orchestra',
          sectionCode: 'ORCH-A',
          tierName: 'VIP',
          price: 150000,
        },
      ],
    });

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify standard PDF header "%PDF-"
    const pdfHeader = pdfBuffer.slice(0, 5).toString('utf-8');
    expect(pdfHeader).toBe('%PDF-');
  });
});
