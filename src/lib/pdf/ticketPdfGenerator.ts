import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import fs from 'fs';
import path from 'path';

export interface TicketPdfSeat {
  seatId: string;
  row: string;
  number: number;
  sectionName: string;
  sectionCode?: string;
  tierName: string;
  price: number;
}

export interface TicketPdfData {
  orderNumber: string;
  orderDate: Date;
  customerName: string;
  customerEmail: string;
  event: {
    title: string;
    venueName: string;
    startTime: Date;
    termsAndConditions?: string | null;
  };
  seats: TicketPdfSeat[];
}

export async function generateTicketBarcodeBuffer(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: 'code128',
        text: text,
        scale: 3,
        height: 12,
        includetext: true,
        textxalign: 'center',
        textsize: 9,
      },
      (err, png) => {
        if (err) reject(err);
        else resolve(png);
      }
    );
  });
}

const DEFAULT_TERMS_INDONESIA = `Dengan membeli tiket ini, Pembeli dianggap telah membaca, memahami, dan menyetujui seluruh Syarat dan Ketentuan yang berlaku. Setiap bentuk pelanggaran terhadap ketentuan tersebut akan dikenakan sanksi dan tindakan sesuai dengan kebijakan dan peraturan yang ditetapkan oleh Penyelenggara.

TICKETING
• Kategori tiket berlaku sesuai dengan section dan nomor kursi yang dipilih pada sistem.
• Tempat duduk atau tribun bagian atas tidak disarankan bagi mereka yang menderita fobia atau takut akan ketinggian.
• Tiket yang sudah dibeli tidak dapat ditukar, diuangkan kembali, ataupun dibatalkan dengan alasan apapun.

KETENTUAN UMUM
• Tiket hanya berlaku apabila pembelian dilakukan secara resmi melalui platform TicketSeat Visualizer.
• E-voucher / E-Ticket bersifat rahasia dan memiliki barcode unik untuk satu kali penggunaan.
• Penggandaan e-ticket tidak dapat digunakan untuk masuk ke dalam area acara berulang kali.
• Penyelenggara dan ticketing partner hanya mengeluarkan e-ticket kepada pembeli yang sah.
• Nomor kursi (Seat Number) ditentukan secara pasti sesuai pilihan kursi saat reservasi.

BATASAN UMUR & PEMERIKSAAN KESELAMATAN
• Kartu Identitas resmi (KTP / SIM / Paspor / Kartu Pelajar) wajib dibawa saat verifikasi di lokasi acara.
• Anak-anak di bawah umur 14 tahun wajib didampingi oleh orang tua atau wali dewasa.
• Demi keamanan bersama, pengunjung wajib melalui pemeriksaan barang bawaan dan tas sebelum memasuki venue.`;

const DEFAULT_TERMS_ENGLISH = `By purchasing tickets for this event, the Purchaser is deemed to have read, understood, and agreed to all applicable Terms and Conditions. Any form of violation of these provisions will be subject to sanctions and actions in accordance with the policies and regulations set by the Organizer.

GENERAL REGULATIONS
• Tickets are only valid if the purchase is made in accordance with the official procedure through TicketSeat Visualizer platform.
• E-tickets are confidential and contain a unique barcode valid for single entry only. Duplication of tickets is strictly prohibited.
• The Organizer guarantees ticket validity only for tickets purchased through authorized channels.
• Seat numbers are assigned as selected during the interactive booking process.
• Tickets purchased cannot be exchanged, refunded, or canceled.

SAFETY & ENTRY POLICIES
• Official Photo ID (National ID Card, Driving License, or Passport) must match the registered buyer name.
• All attendees are subject to security search and inspection upon entry to the venue grounds.
• Flash photography, professional video equipment, and outside food & beverages are strictly prohibited.`;

export async function generateTicketsPdf(data: TicketPdfData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        autoFirstPage: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const totalTickets = data.seats.length;

      // Find poster image path
      const posterPath1 = path.join(process.cwd(), 'public', 'img', 'Home sweet Loan Poster.jpeg');
      const hasPoster = fs.existsSync(posterPath1);

      for (let i = 0; i < totalTickets; i++) {
        const seat = data.seats[i];
        const ticketSeq = `TICKET ${i + 1} of ${totalTickets}`;
        const barcodeVal = `${data.orderNumber.replace(/[^0-9A-Z]/g, '')}${seat.seatId.replace(/[^0-9A-Z]/g, '').slice(0, 6)}`;
        const barcodeBuffer = await generateTicketBarcodeBuffer(barcodeVal);

        if (i > 0) {
          doc.addPage();
        }

        const pageWidth = doc.page.width - 72; // Printable width = 595.28 - 72 = 523.28
        const startX = 36;
        let curY = 36;

        // ─────────────────────────────────────────────────────────────
        // 1. TOP TICKET HEADER BOX (Bordered Box)
        // ─────────────────────────────────────────────────────────────
        const topBoxHeight = 110;
        doc.rect(startX, curY, pageWidth, topBoxHeight)
          .lineWidth(1)
          .strokeColor('#E2E8F0')
          .fillColor('#F8FAFC')
          .fillAndStroke();

        doc.fillColor('#DC2626')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(`TICKET TYPE : ${seat.tierName.toUpperCase()} (SEATING)`, startX + 16, curY + 14);

        doc.fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text('SEATING NUMBERS TICKET INCLUDES GOVERNMENT FEE 10% AND PLATFORM FEE 5%', startX + 16, curY + 32);

        // Door / Section / Row / Seat Number
        doc.fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(`DOOR : ${seat.sectionCode || seat.sectionName.toUpperCase()}`, startX + 16, curY + 52)
          .text(`ROW : ${seat.row}`, startX + 16, curY + 70)
          .text(`SEAT NUMBER : ${seat.number}`, startX + 16, curY + 88);

        curY += topBoxHeight + 12;

        // ─────────────────────────────────────────────────────────────
        // 2. SHOW BANNER & BARCODE SECTION (2 Columns)
        // ─────────────────────────────────────────────────────────────
        const bannerBoxHeight = 140;
        const colWidth = (pageWidth - 12) / 2;

        // Left: Poster / Event Banner
        if (hasPoster) {
          try {
            doc.image(posterPath1, startX, curY, {
              fit: [colWidth, bannerBoxHeight],
              align: 'center',
              valign: 'center',
            });
          } catch {
            // Fallback banner placeholder
            doc.rect(startX, curY, colWidth, bannerBoxHeight).fill('#1E293B');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(data.event.title, startX + 10, curY + 50, { width: colWidth - 20, align: 'center' });
          }
        } else {
          doc.rect(startX, curY, colWidth, bannerBoxHeight).fill('#1E293B');
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(data.event.title, startX + 10, curY + 50, { width: colWidth - 20, align: 'center' });
        }

        // Right: Logo / Organizer & Barcode
        const rightX = startX + colWidth + 12;
        doc.fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text('TicketSeat Visualizer', rightX, curY + 6, { align: 'center', width: colWidth })
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#64748B')
          .text('OFFICIAL E-TICKET SERVICE', rightX, curY + 20, { align: 'center', width: colWidth });

        // Barcode Image
        try {
          doc.image(barcodeBuffer, rightX + (colWidth - 200) / 2, curY + 42, {
            width: 200,
            height: 58,
          });
        } catch (err) {
          console.error('Barcode embed error:', err);
        }

        doc.fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(ticketSeq, rightX, curY + 115, { align: 'center', width: colWidth });

        curY += bannerBoxHeight + 12;

        // ─────────────────────────────────────────────────────────────
        // 3. EVENT & BUYER INFO GRID (2 Columns with clean borders)
        // ─────────────────────────────────────────────────────────────
        const infoBoxHeight = 65;
        doc.rect(startX, curY, colWidth, infoBoxHeight).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.rect(rightX, curY, colWidth, infoBoxHeight).fillAndStroke('#F8FAFC', '#E2E8F0');

        // Left info: Event Name, Venue, Date
        doc.fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(data.event.title.toUpperCase(), startX + 10, curY + 10, { width: colWidth - 20 })
          .font('Helvetica')
          .fontSize(7.5)
          .text(
            `${data.event.startTime.toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }).toUpperCase()} ${data.event.startTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - SELESAI`,
            startX + 10,
            curY + 26
          )
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(data.event.venueName.toUpperCase(), startX + 10, curY + 40);

        // Right info: Booking Code, Customer Name, Ordered on
        doc.fillColor('#0F172A')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(data.orderNumber, rightX + 10, curY + 10, { align: 'center', width: colWidth - 20 })
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(`Guest_${i + 1} of ${data.customerName}`, rightX + 10, curY + 25, { align: 'center', width: colWidth - 20 })
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#64748B')
          .text(
            `Ordered on : ${data.orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
            rightX + 10,
            curY + 44,
            { align: 'center', width: colWidth - 20 }
          );

        curY += infoBoxHeight + 14;

        // ─────────────────────────────────────────────────────────────
        // 4. TERMS & CONDITIONS HEADER
        // ─────────────────────────────────────────────────────────────
        doc.fillColor('#DC2626')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text('TERMS & CONDITION', startX, curY, { align: 'center', width: pageWidth });

        curY += 14;

        // Terms text (Indonesian + English)
        const termsToRender = data.event.termsAndConditions || `${DEFAULT_TERMS_INDONESIA}\n\n${DEFAULT_TERMS_ENGLISH}`;

        doc.fillColor('#1E293B')
          .font('Helvetica')
          .fontSize(6.5)
          .text(termsToRender, startX, curY, {
            width: pageWidth,
            align: 'justify',
            lineGap: 1.5,
          });

        // ─────────────────────────────────────────────────────────────
        // 5. FOOTER LINK
        // ─────────────────────────────────────────────────────────────
        const footerY = doc.page.height - 24;
        doc.fillColor('#94A3B8')
          .font('Helvetica')
          .fontSize(6.5)
          .text(`https://ticketseatvisualizer.vercel.app/events/${data.orderNumber.toLowerCase()}`, startX, footerY, {
            continued: true,
          })
          .text(`Page ${i + 1} of ${totalTickets}`, { align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
