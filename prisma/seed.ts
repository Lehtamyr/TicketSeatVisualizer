import { PrismaClient, ShapeType, SeatStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Ray-casting Point-in-Polygon check
function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Seat status generator helper
function getSeatStatus(index: number): SeatStatus {
  if (index % 7 === 0) return SeatStatus.RESERVED;
  if (index % 13 === 0) return SeatStatus.HELD;
  return SeatStatus.AVAILABLE;
}

const ROW_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];

// Helper to generate seat grid for rectangle/square
function generateRectSeats(
  x: number,
  y: number,
  w: number,
  h: number,
  rowCount: number,
  seatsPerRow: number
) {
  const seats: { row: string; number: number; x: number; y: number; status: SeatStatus }[] = [];
  const padX = 15;
  const padY = 15;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const stepX = seatsPerRow > 1 ? usableW / (seatsPerRow - 1) : 0;
  const stepY = rowCount > 1 ? usableH / (rowCount - 1) : 0;

  let globalIdx = 0;
  for (let r = 0; r < rowCount; r++) {
    const rowName = ROW_NAMES[r % ROW_NAMES.length];
    for (let s = 1; s <= seatsPerRow; s++) {
      const seatX = Math.round((x + padX + (s - 1) * stepX) * 10) / 10;
      const seatY = Math.round((y + padY + r * stepY) * 10) / 10;
      seats.push({
        row: rowName,
        number: s,
        x: seatX,
        y: seatY,
        status: getSeatStatus(globalIdx++),
      });
    }
  }
  return seats;
}

// Helper to generate seats inside arbitrary polygon/triangle points
function generatePolygonSeats(
  points: { x: number; y: number }[],
  targetRows: number = 4,
  targetCols: number = 10
) {
  const seats: { row: string; number: number; x: number; y: number; status: SeatStatus }[] = [];
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));

  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;
  const usableMinX = minX + padX;
  const usableMaxX = maxX - padX;
  const usableMinY = minY + padY;
  const usableMaxY = maxY - padY;

  const stepY = targetRows > 1 ? (usableMaxY - usableMinY) / (targetRows - 1) : 0;
  let globalIdx = 0;

  for (let r = 0; r < targetRows; r++) {
    const py = usableMinY + r * stepY;
    const rowName = ROW_NAMES[r % ROW_NAMES.length];
    const stepX = targetCols > 1 ? (usableMaxX - usableMinX) / (targetCols - 1) : 0;

    let colNum = 1;
    for (let c = 0; c < targetCols; c++) {
      const px = usableMinX + c * stepX;
      if (pointInPolygon({ x: px, y: py }, points)) {
        seats.push({
          row: rowName,
          number: colNum++,
          x: Math.round(px * 10) / 10,
          y: Math.round(py * 10) / 10,
          status: getSeatStatus(globalIdx++),
        });
      }
    }
  }
  return seats;
}

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing records in dependency order
  await prisma.reservationSeat.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.section.deleteMany();
  await prisma.event.deleteMany();
  await prisma.venueLayout.deleteMany();
  await prisma.pricingTier.deleteMany();

  // 2. Create Pricing Tiers
  const vipTier = await prisma.pricingTier.create({
    data: { name: 'VIP', color: '#EAB308', basePrice: 150.00 },
  });
  const premiumTier = await prisma.pricingTier.create({
    data: { name: 'Premium', color: '#3B82F6', basePrice: 100.00 },
  });
  const standardTier = await prisma.pricingTier.create({
    data: { name: 'Standard', color: '#10B981', basePrice: 60.00 },
  });
  const economyTier = await prisma.pricingTier.create({
    data: { name: 'Economy', color: '#6B7280', basePrice: 35.00 },
  });

  // ----------------------------------------------------
  // VENUE 1: Grand Stadium (Canvas 1200 x 800)
  // ----------------------------------------------------
  const stadiumLayout = await prisma.venueLayout.create({
    data: {
      name: 'Grand Stadium Layout',
      canvasWidth: 1200,
      canvasHeight: 800,
    },
  });

  const stadiumEvent = await prisma.event.create({
    data: {
      title: 'Championship Final 2026',
      description: 'The ultimate showdown of the season at Grand Stadium.',
      venueName: 'Grand Stadium',
      startTime: new Date('2026-09-15T19:00:00Z'),
      viewBoxWidth: 1200,
      viewBoxHeight: 800,
      layoutId: stadiumLayout.id,
    },
  });

  // Section 1: North Stand Main (RECTANGLE)
  const northRectPoints = [
    { x: 300, y: 50 },
    { x: 900, y: 50 },
    { x: 900, y: 170 },
    { x: 300, y: 170 },
  ];
  const northSection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'North Stand Main',
      code: 'SEC-N1',
      shapeType: ShapeType.RECTANGLE,
      geometry: JSON.stringify({ shapeType: 'RECTANGLE', points: northRectPoints, x: 300, y: 50, width: 600, height: 120 }),
      pricingTierId: standardTier.id,
      price: 60.00,
      color: '#10B981',
      rowCount: 5,
      seatsPerRow: 15,
    },
  });

  const northSeats = generateRectSeats(300, 50, 600, 120, 5, 15);
  await prisma.seat.createMany({
    data: northSeats.map((s) => ({
      sectionId: northSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: standardTier.id,
    })),
  });

  // Section 2: South Stand Lower (RECTANGLE)
  const southRectPoints = [
    { x: 300, y: 630 },
    { x: 900, y: 630 },
    { x: 900, y: 750 },
    { x: 300, y: 750 },
  ];
  const southSection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'South Stand Lower',
      code: 'SEC-S1',
      shapeType: ShapeType.RECTANGLE,
      geometry: JSON.stringify({ shapeType: 'RECTANGLE', points: southRectPoints, x: 300, y: 630, width: 600, height: 120 }),
      pricingTierId: economyTier.id,
      price: 35.00,
      color: '#6B7280',
      rowCount: 5,
      seatsPerRow: 15,
    },
  });

  const southSeats = generateRectSeats(300, 630, 600, 120, 5, 15);
  await prisma.seat.createMany({
    data: southSeats.map((s) => ({
      sectionId: southSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: economyTier.id,
    })),
  });

  // Section 3: VIP Suite West (SQUARE)
  const vipWestPoints = [
    { x: 150, y: 200 },
    { x: 270, y: 200 },
    { x: 270, y: 320 },
    { x: 150, y: 320 },
  ];
  const vipWestSection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'VIP Suite West',
      code: 'SEC-VIP1',
      shapeType: ShapeType.SQUARE,
      geometry: JSON.stringify({ shapeType: 'SQUARE', points: vipWestPoints, x: 150, y: 200, width: 120, height: 120 }),
      pricingTierId: vipTier.id,
      price: 150.00,
      color: '#EAB308',
      rowCount: 3,
      seatsPerRow: 6,
    },
  });

  const vipWestSeats = generateRectSeats(150, 200, 120, 120, 3, 6);
  await prisma.seat.createMany({
    data: vipWestSeats.map((s) => ({
      sectionId: vipWestSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: vipTier.id,
    })),
  });

  // Section 4: VIP Suite East (SQUARE)
  const vipEastPoints = [
    { x: 930, y: 200 },
    { x: 1050, y: 200 },
    { x: 1050, y: 320 },
    { x: 930, y: 320 },
  ];
  const vipEastSection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'VIP Suite East',
      code: 'SEC-VIP2',
      shapeType: ShapeType.SQUARE,
      geometry: JSON.stringify({ shapeType: 'SQUARE', points: vipEastPoints, x: 930, y: 200, width: 120, height: 120 }),
      pricingTierId: vipTier.id,
      price: 150.00,
      color: '#EAB308',
      rowCount: 3,
      seatsPerRow: 6,
    },
  });

  const vipEastSeats = generateRectSeats(930, 200, 120, 120, 3, 6);
  await prisma.seat.createMany({
    data: vipEastSeats.map((s) => ({
      sectionId: vipEastSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: vipTier.id,
    })),
  });

  // Section 5: Northwest Corner (TRIANGLE)
  const nwTrianglePoints = [
    { x: 150, y: 50 },
    { x: 270, y: 50 },
    { x: 270, y: 170 },
  ];
  const nwSection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'Northwest Corner',
      code: 'SEC-NW',
      shapeType: ShapeType.TRIANGLE,
      geometry: JSON.stringify({ shapeType: 'TRIANGLE', points: nwTrianglePoints }),
      pricingTierId: premiumTier.id,
      price: 100.00,
      color: '#3B82F6',
      rowCount: 4,
      seatsPerRow: 6,
    },
  });

  const nwSeats = generatePolygonSeats(nwTrianglePoints, 4, 8);
  await prisma.seat.createMany({
    data: nwSeats.map((s) => ({
      sectionId: nwSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: premiumTier.id,
    })),
  });

  // Section 6: Northeast Corner (TRIANGLE)
  const neTrianglePoints = [
    { x: 930, y: 50 },
    { x: 1050, y: 50 },
    { x: 930, y: 170 },
  ];
  const neSection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'Northeast Corner',
      code: 'SEC-NE',
      shapeType: ShapeType.TRIANGLE,
      geometry: JSON.stringify({ shapeType: 'TRIANGLE', points: neTrianglePoints }),
      pricingTierId: premiumTier.id,
      price: 100.00,
      color: '#3B82F6',
      rowCount: 4,
      seatsPerRow: 6,
    },
  });

  const neSeats = generatePolygonSeats(neTrianglePoints, 4, 8);
  await prisma.seat.createMany({
    data: neSeats.map((s) => ({
      sectionId: neSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: premiumTier.id,
    })),
  });

  // Section 7: West Endzone Curve (POLYGON)
  const westPolyPoints = [
    { x: 80, y: 340 },
    { x: 180, y: 340 },
    { x: 220, y: 460 },
    { x: 180, y: 580 },
    { x: 80, y: 580 },
  ];
  const westPolySection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'West Endzone Curve',
      code: 'SEC-W-END',
      shapeType: ShapeType.POLYGON,
      geometry: JSON.stringify({ shapeType: 'POLYGON', points: westPolyPoints }),
      pricingTierId: standardTier.id,
      price: 60.00,
      color: '#10B981',
      rowCount: 5,
      seatsPerRow: 8,
    },
  });

  const westPolySeats = generatePolygonSeats(westPolyPoints, 5, 8);
  await prisma.seat.createMany({
    data: westPolySeats.map((s) => ({
      sectionId: westPolySection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: standardTier.id,
    })),
  });

  // Section 8: East Endzone Curve (POLYGON)
  const eastPolyPoints = [
    { x: 1020, y: 340 },
    { x: 1120, y: 340 },
    { x: 1120, y: 580 },
    { x: 1020, y: 580 },
    { x: 980, y: 460 },
  ];
  const eastPolySection = await prisma.section.create({
    data: {
      layoutId: stadiumLayout.id,
      eventId: stadiumEvent.id,
      name: 'East Endzone Curve',
      code: 'SEC-E-END',
      shapeType: ShapeType.POLYGON,
      geometry: JSON.stringify({ shapeType: 'POLYGON', points: eastPolyPoints }),
      pricingTierId: standardTier.id,
      price: 60.00,
      color: '#10B981',
      rowCount: 5,
      seatsPerRow: 8,
    },
  });

  const eastPolySeats = generatePolygonSeats(eastPolyPoints, 5, 8);
  await prisma.seat.createMany({
    data: eastPolySeats.map((s) => ({
      sectionId: eastPolySection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: standardTier.id,
    })),
  });

  // ----------------------------------------------------
  // VENUE 2: Metropolitan Theater (Canvas 1000 x 700)
  // ----------------------------------------------------
  const theaterLayout = await prisma.venueLayout.create({
    data: {
      name: 'Metropolitan Theater Layout',
      canvasWidth: 1000,
      canvasHeight: 700,
    },
  });

  const theaterEvent = await prisma.event.create({
    data: {
      title: 'Symphony Gala Concert 2026',
      description: 'An evening of classical masterpieces at Metropolitan Theater.',
      venueName: 'Metropolitan Theater',
      startTime: new Date('2026-10-20T20:00:00Z'),
      viewBoxWidth: 1000,
      viewBoxHeight: 700,
      layoutId: theaterLayout.id,
    },
  });

  // Section 1: Orchestra Center (RECTANGLE)
  const orchCenterPoints = [
    { x: 300, y: 420 },
    { x: 700, y: 420 },
    { x: 700, y: 640 },
    { x: 300, y: 640 },
  ];
  const orchCenter = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Orchestra Center',
      code: 'TH-OCH-C',
      shapeType: ShapeType.RECTANGLE,
      geometry: JSON.stringify({ shapeType: 'RECTANGLE', points: orchCenterPoints, x: 300, y: 420, width: 400, height: 220 }),
      pricingTierId: vipTier.id,
      price: 150.00,
      color: '#EAB308',
      rowCount: 6,
      seatsPerRow: 16,
    },
  });

  const orchCenterSeats = generateRectSeats(300, 420, 400, 220, 6, 16);
  await prisma.seat.createMany({
    data: orchCenterSeats.map((s) => ({
      sectionId: orchCenter.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: vipTier.id,
    })),
  });

  // Section 2: Orchestra Wing Left (POLYGON)
  const orchLeftPoints = [
    { x: 90, y: 440 },
    { x: 280, y: 420 },
    { x: 280, y: 640 },
    { x: 140, y: 640 },
  ];
  const orchLeft = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Orchestra Wing Left',
      code: 'TH-OCH-L',
      shapeType: ShapeType.POLYGON,
      geometry: JSON.stringify({ shapeType: 'POLYGON', points: orchLeftPoints }),
      pricingTierId: premiumTier.id,
      price: 100.00,
      color: '#3B82F6',
      rowCount: 6,
      seatsPerRow: 8,
    },
  });

  const orchLeftSeats = generatePolygonSeats(orchLeftPoints, 6, 8);
  await prisma.seat.createMany({
    data: orchLeftSeats.map((s) => ({
      sectionId: orchLeft.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: premiumTier.id,
    })),
  });

  // Section 3: Orchestra Wing Right (POLYGON)
  const orchRightPoints = [
    { x: 720, y: 420 },
    { x: 910, y: 440 },
    { x: 860, y: 640 },
    { x: 720, y: 640 },
  ];
  const orchRight = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Orchestra Wing Right',
      code: 'TH-OCH-R',
      shapeType: ShapeType.POLYGON,
      geometry: JSON.stringify({ shapeType: 'POLYGON', points: orchRightPoints }),
      pricingTierId: premiumTier.id,
      price: 100.00,
      color: '#3B82F6',
      rowCount: 6,
      seatsPerRow: 8,
    },
  });

  const orchRightSeats = generatePolygonSeats(orchRightPoints, 6, 8);
  await prisma.seat.createMany({
    data: orchRightSeats.map((s) => ({
      sectionId: orchRight.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: premiumTier.id,
    })),
  });

  // Section 4: Mezzanine Tier (RECTANGLE)
  const mezzPoints = [
    { x: 220, y: 240 },
    { x: 780, y: 240 },
    { x: 780, y: 380 },
    { x: 220, y: 380 },
  ];
  const mezzSection = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Mezzanine Tier',
      code: 'TH-MEZZ',
      shapeType: ShapeType.RECTANGLE,
      geometry: JSON.stringify({ shapeType: 'RECTANGLE', points: mezzPoints, x: 220, y: 240, width: 560, height: 140 }),
      pricingTierId: standardTier.id,
      price: 60.00,
      color: '#10B981',
      rowCount: 4,
      seatsPerRow: 16,
    },
  });

  const mezzSeats = generateRectSeats(220, 240, 560, 140, 4, 16);
  await prisma.seat.createMany({
    data: mezzSeats.map((s) => ({
      sectionId: mezzSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: standardTier.id,
    })),
  });

  // Section 5: Grand Balcony (RECTANGLE)
  const balcPoints = [
    { x: 180, y: 60 },
    { x: 820, y: 60 },
    { x: 820, y: 180 },
    { x: 180, y: 180 },
  ];
  const balcSection = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Grand Balcony',
      code: 'TH-BALC',
      shapeType: ShapeType.RECTANGLE,
      geometry: JSON.stringify({ shapeType: 'RECTANGLE', points: balcPoints, x: 180, y: 60, width: 640, height: 120 }),
      pricingTierId: economyTier.id,
      price: 35.00,
      color: '#6B7280',
      rowCount: 4,
      seatsPerRow: 18,
    },
  });

  const balcSeats = generateRectSeats(180, 60, 640, 120, 4, 18);
  await prisma.seat.createMany({
    data: balcSeats.map((s) => ({
      sectionId: balcSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: economyTier.id,
    })),
  });

  // Section 6: Royal Box Left (SQUARE)
  const boxLeftPoints = [
    { x: 100, y: 260 },
    { x: 190, y: 260 },
    { x: 190, y: 350 },
    { x: 100, y: 350 },
  ];
  const boxLeftSection = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Royal Box Left',
      code: 'TH-BOX-L',
      shapeType: ShapeType.SQUARE,
      geometry: JSON.stringify({ shapeType: 'SQUARE', points: boxLeftPoints, x: 100, y: 260, width: 90, height: 90 }),
      pricingTierId: vipTier.id,
      price: 150.00,
      color: '#EAB308',
      rowCount: 2,
      seatsPerRow: 4,
    },
  });

  const boxLeftSeats = generateRectSeats(100, 260, 90, 90, 2, 4);
  await prisma.seat.createMany({
    data: boxLeftSeats.map((s) => ({
      sectionId: boxLeftSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: vipTier.id,
    })),
  });

  // Section 7: Royal Box Right (SQUARE)
  const boxRightPoints = [
    { x: 810, y: 260 },
    { x: 900, y: 260 },
    { x: 900, y: 350 },
    { x: 810, y: 350 },
  ];
  const boxRightSection = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Royal Box Right',
      code: 'TH-BOX-R',
      shapeType: ShapeType.SQUARE,
      geometry: JSON.stringify({ shapeType: 'SQUARE', points: boxRightPoints, x: 810, y: 260, width: 90, height: 90 }),
      pricingTierId: vipTier.id,
      price: 150.00,
      color: '#EAB308',
      rowCount: 2,
      seatsPerRow: 4,
    },
  });

  const boxRightSeats = generateRectSeats(810, 260, 90, 90, 2, 4);
  await prisma.seat.createMany({
    data: boxRightSeats.map((s) => ({
      sectionId: boxRightSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: vipTier.id,
    })),
  });

  // Section 8: Stage Flank Left (TRIANGLE)
  const flankLeftPoints = [
    { x: 180, y: 370 },
    { x: 280, y: 370 },
    { x: 280, y: 410 },
  ];
  const flankLeftSection = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Stage Flank Left',
      code: 'TH-FLK-L',
      shapeType: ShapeType.TRIANGLE,
      geometry: JSON.stringify({ shapeType: 'TRIANGLE', points: flankLeftPoints }),
      pricingTierId: premiumTier.id,
      price: 100.00,
      color: '#3B82F6',
      rowCount: 3,
      seatsPerRow: 4,
    },
  });

  const flankLeftSeats = generatePolygonSeats(flankLeftPoints, 3, 5);
  await prisma.seat.createMany({
    data: flankLeftSeats.map((s) => ({
      sectionId: flankLeftSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: premiumTier.id,
    })),
  });

  // Section 9: Stage Flank Right (TRIANGLE)
  const flankRightPoints = [
    { x: 720, y: 370 },
    { x: 820, y: 370 },
    { x: 720, y: 410 },
  ];
  const flankRightSection = await prisma.section.create({
    data: {
      layoutId: theaterLayout.id,
      eventId: theaterEvent.id,
      name: 'Stage Flank Right',
      code: 'TH-FLK-R',
      shapeType: ShapeType.TRIANGLE,
      geometry: JSON.stringify({ shapeType: 'TRIANGLE', points: flankRightPoints }),
      pricingTierId: premiumTier.id,
      price: 100.00,
      color: '#3B82F6',
      rowCount: 3,
      seatsPerRow: 4,
    },
  });

  const flankRightSeats = generatePolygonSeats(flankRightPoints, 3, 5);
  await prisma.seat.createMany({
    data: flankRightSeats.map((s) => ({
      sectionId: flankRightSection.id,
      row: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      status: s.status,
      pricingTierId: premiumTier.id,
    })),
  });

  console.log('✅ Database seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
