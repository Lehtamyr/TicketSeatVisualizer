# Ticketing Seat Visualizer & Admin Layout Builder

An interactive, high-performance venue seat selection, checkout, and administration platform built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, and **PostgreSQL**.

---

## 🚀 Key Features

### 🎟️ User Visualizer & Seat Selection (Step 1)
- **Modular Vector Venue Map**: High-performance SVG renderer supporting dynamic section shapes (rectangles, squares, triangles, custom polygons).
- **Smooth Camera Transitions**: Micro/macro zoom animations into section bounding boxes upon selection.
- **Micro Seat Grid Picker**: Granular seat map with row/number layout, pricing tier badges, and interactive seat tooltips.
- **Cart & Reservation Timer**: Interactive booking cart with real-time seat lock and hold countdown timer.
- **Atomic Concurrency Protection**: Multi-layered double-booking prevention using PostgreSQL `SELECT ... FOR UPDATE` row locks and server-side atomic transactions.

### 💳 4-Step Seamless Checkout Funnel
- **Step 1: Seat Selection & Holding** (`/events/[eventId]`): Select available seats with instant lock and real-time timer.
- **Step 2A: Buyer Information** (`/events/[eventId]/checkout`): Comprehensive buyer registration with client & server-side validation (Zod schema).
- **Step 2B: Payment Method Selection** (`/events/[eventId]/checkout/payment-method`): Selection modal between available payment channels with brand badges and confirmation popup.
- **Step 3: Order Confirmation** (`/events/[eventId]/checkout/confirmation`): Complete summary of selected seats, tier breakdown, pricing totals, buyer credentials, and selected payment method before final commit.
- **Step 4: Payment Instructions & Simulation** (`/events/[eventId]/checkout/payment`):
  - **QRIS Standar Nasional**: Dynamic QR code simulator compatible with all e-wallets (GoPay, OVO, Dana, LinkAja) and mobile banking apps.
  - **Bank Jakarta Virtual Account**: Official 10-digit VA format (prefix `99` followed by 8 unique digits) with one-click clipboard copy and step-by-step payment instructions.
  - **Mock Payment Gateway Simulator**: Test instant payment fulfillment and database order creation directly in development/preview environments.
- **Persistent Checkout Journey Tracker**: Responsive multi-step progress bar guiding users through each phase of checkout.

### 🛠️ Interactive Admin Layout Builder (`/admin/layout-builder`)
- **Canvas Geometry Workbench**: Interactive tools for drawing Rectangles, Squares, Triangles, and Freeform Polygons.
- **Point-in-Polygon (PIP) Auto-Generator**: Ray-casting PIP algorithm that auto-populates seats inside arbitrary section boundaries.
- **Pricing Tier Management**: Customizable pricing tiers, color palettes, and base prices assigned per section.
- **Section Property Inspector**: Full control over section names, pricing tiers, row/column counts, and color codes.
- **Save & Publish Layouts**: Instantly persist layouts and generated seats directly to PostgreSQL.

### 🧪 Comprehensive Testing Infrastructure
- **Unit Testing (Vitest)**: 120+ tests covering geometry algorithms, Point-in-Polygon ray-casting, seat grid generation, pricing tier persistence, and checkout funnel calculations.
- **E2E Testing (Playwright)**: End-to-end test suites covering the entire customer purchasing journey, admin layout builder, backtracking validation, and database state verification.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| **Framework** | Next.js 15+ (App Router, Server Actions, API Routes) |
| **Language** | TypeScript (Strict mode) |
| **Styling** | Tailwind CSS, Lucide Icons |
| **Database** | PostgreSQL (managed via Prisma ORM) |
| **Validation** | Zod |
| **Geometry Engine** | Custom Point-in-Polygon Ray-Casting & Vector SVG Math |
| **Unit Testing** | Vitest |
| **E2E Testing** | Playwright |

---

## 📁 Project Structure

```
ticketingSeatVisualizer/
├── prisma/
│   ├── schema.prisma        # Prisma Database Schema (Event, VenueLayout, Section, Seat, Reservation, Order)
│   └── seed.ts              # Seed script for sample layouts (Stadium, Theater)
├── src/
│   ├── actions/             # Server Actions (lockSeats, confirmBooking, saveLayout, getEvents, etc.)
│   ├── app/
│   │   ├── admin/           # Admin Layout Builder pages (/admin, /admin/layout-builder)
│   │   ├── api/             # REST API Routes (/api/events, /api/layouts, /api/reservations/confirm)
│   │   └── events/          # Venue Visualizer & Checkout Funnel
│   │       └── [eventId]/
│   │           ├── checkout/
│   │           │   ├── page.tsx               # Step 2A: Buyer Information
│   │           │   ├── payment-method/        # Step 2B: Payment Method Picker
│   │           │   ├── confirmation/          # Step 3: Order Confirmation
│   │           │   └── payment/               # Step 4: Payment Instructions & Mock Gateway
│   │           └── page.tsx                   # Step 1: Interactive Seat Map Visualizer
│   ├── components/
│   │   ├── admin/           # Admin Canvas & Drawing components
│   │   ├── checkout/        # CheckoutJourneyTracker & shared checkout components
│   │   └── visualizer/      # SVG Venue Map, Seat Grid Picker, Booking Cart
│   ├── lib/
│   │   ├── geometry.ts      # Ray-Casting Point-in-Polygon & bounding box math
│   │   ├── seatGenerator.ts # Seat grid auto-generator algorithm
│   │   ├── schemas.ts       # Zod validation schemas
│   │   ├── buyerStorage.ts  # Local buyer info persistence helper
│   │   └── prisma.ts        # Prisma Client singleton
│   └── types/               # TypeScript interfaces & domain types
├── tests/
│   ├── unit/                # Vitest unit test suites
│   ├── e2e/                 # Playwright end-to-end specs
│   └── helpers/             # Test seeders and fixtures
├── package.json
└── README.md
```

---

## 🚦 Getting Started

### Prerequisites
- **Node.js**: `v18+` or `v20+`
- **npm** or **yarn** / **pnpm**
- **PostgreSQL**

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Lehtamyr/TicketSeatVisualizer.git
   cd ticketingSeatVisualizer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Ensure `DATABASE_URL` matches your PostgreSQL database configuration:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketing_db?schema=public"
   ```

4. **Prepare the database**:
   Generate Prisma client, apply database schema, and seed sample venue data:
   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Next.js development server on port 3000 |
| `npm run build` | Generates Prisma client and builds the application for production |
| `npm run start` | Starts the production server |
| `npm run typecheck` | Runs TypeScript compiler type checking without emitting files |
| `npm run test` | Runs unit tests using Vitest |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run test:e2e` | Runs Playwright end-to-end browser tests |
| `npm run test:all` | Runs both Vitest unit tests and Playwright E2E tests |
| `npm run db:push` | Pushes Prisma schema changes directly to the database |
| `npm run db:seed` | Runs the database seed script to populate sample events and layouts |

---

## 🧪 Running Tests

### Unit Tests (Vitest)
```bash
npm run test
```

### End-to-End Tests (Playwright)
```bash
npx playwright test
```

---

## 📄 License

This project is licensed under the MIT License.
