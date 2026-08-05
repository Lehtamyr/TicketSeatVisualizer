# Ticketing Seat Visualizer & Admin Layout Builder

An interactive, high-performance venue seat selection and administration platform built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, and **PostgreSQL**.

---

## 🚀 Key Features

### 🎟️ User Visualizer & Seat Selection
- **Modular Vector Venue Map**: High-performance SVG renderer supporting dynamic shapes (rectangles, squares, triangles, custom polygons).
- **Smooth Camera Transitions**: Micro/macro zoom animations into section bounding boxes upon selection.
- **Micro Seat Grid Picker**: Granular seat map with row/number layout and interactive seat tooltips.
- **Cart & Reservation Timer**: Interactive booking cart with a 10-minute seat hold countdown timer.
- **Atomic Concurrency Protection**: Multi-layered double-booking prevention using PostgreSQL `SELECT ... FOR UPDATE` row locks and server-side atomic transactions.

### 🛠️ Interactive Admin Layout Builder (`/admin/layout-builder`)
- **Canvas Geometry Workbench**: Interactive tools for drawing Rectangles, Squares, Triangles, and Freeform Polygons.
- **Point-in-Polygon (PIP) Auto-Generator**: Ray-casting PIP algorithm that auto-populates seats inside arbitrary section boundaries.
- **Section Property Inspector**: Full control over section names, pricing tiers, base prices, row/column counts, and color codes.
- **Save & Publish Layouts**: Instantly persist layouts and generated seats directly to the database.

### 🧪 Comprehensive Testing Infrastructure
- **Unit Testing (Vitest)**: Tests for geometry algorithms, Point-in-Polygon ray-casting, seat grid generation, and server action handling.
- **E2E Testing (Playwright)**: End-to-end test suites covering user seat selection, admin layout creation, and concurrency scenarios.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| **Framework** | Next.js 15+ (App Router, Server Actions) |
| **Language** | TypeScript (Strict mode) |
| **Styling** | Tailwind CSS, Lucide Icons |
| **Database** | PostgreSQL / SQLite (managed via Prisma ORM) |
| **Geometry Engine** | Custom Point-in-Polygon Ray-Casting & Vector SVG Math |
| **Unit Testing** | Vitest |
| **E2E Testing** | Playwright |

---

## 📁 Project Structure

```
ticketingSeatVisualizer/
├── prisma/
│   ├── schema.prisma        # Prisma Database Schema (Event, VenueLayout, Section, Seat, Reservation)
│   └── seed.ts              # Seed script for sample layouts (Stadium, Theater)
├── src/
│   ├── actions/             # Server Actions (lockSeats, confirmBooking, saveLayout, etc.)
│   ├── app/
│   │   ├── admin/           # Admin Layout Builder pages (/admin, /admin/layout-builder)
│   │   ├── api/             # REST API Routes (/api/events, /api/layouts, /api/reservations)
│   │   └── events/          # Venue Visualizer & Event pages (/events, /events/[eventId])
│   ├── components/
│   │   ├── admin/           # Admin Canvas & Drawing components
│   │   └── visualizer/      # SVG Venue Map, Seat Grid Picker, Booking Cart
│   ├── lib/
│   │   ├── geometry.ts      # Ray-Casting Point-in-Polygon & bounding box math
│   │   ├── seatGenerator.ts # Seat grid auto-generator algorithm
│   │   └── prisma.ts        # Prisma Client singleton
│   └── types/               # TypeScript interfaces & domain types
├── tests/
│   ├── unit/                # Vitest unit test suites
│   └── e2e/                 # Playwright end-to-end specs
├── package.json
└── README.md
```

---

## 🚦 Getting Started

### Prerequisites
- **Node.js**: `v18+` or `v20+`
- **npm** or **yarn** / **pnpm**
- **PostgreSQL** (or SQLite for local testing)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
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
   Ensure `DATABASE_URL` matches your database configuration:
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
| `npm run test` | Runs unit tests using Vitest |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run db:push` | Pushes Prisma schema changes directly to the database |
| `npm run db:seed` | Runs the database seed script to populate sample layouts |

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
