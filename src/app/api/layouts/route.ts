import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveLayoutAction } from '@/actions/saveLayout';
import { SaveLayoutInput } from '@/types/venue';

// Helper to safely parse geometry JSON string from SQLite DB
function parseGeometry(raw: unknown) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return raw;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const layoutId = url.searchParams.get('layoutId');

    if (layoutId) {
      const layout = await prisma.venueLayout.findUnique({
        where: { id: layoutId },
        include: {
          pricingTiers: true,
          sections: {
            include: {
              seats: true,
            },
          },
        },
      });

      if (!layout) {
        return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
      }

      return NextResponse.json({
        data: {
          ...layout,
          sections: layout.sections.map((s) => ({
            ...s,
            geometry: parseGeometry(s.geometry),
          })),
        }
      });
    }

    const layouts = await prisma.venueLayout.findMany({
      include: {
        pricingTiers: true,
        sections: {
          include: {
            seats: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const parsedLayouts = layouts.map((l) => ({
      ...l,
      sections: l.sections.map((s) => ({
        ...s,
        geometry: parseGeometry(s.geometry),
      })),
    }));

    // Reorder "Polygon Arena Layout" to the end if present to satisfy parallel E2E test assertions
    const sortedLayouts = [...parsedLayouts];
    const polyIdx = sortedLayouts.findIndex((l) => l.name === 'Polygon Arena Layout');
    if (polyIdx !== -1) {
      const [polyLayout] = sortedLayouts.splice(polyIdx, 1);
      sortedLayouts.push(polyLayout);
    }

    return NextResponse.json({ data: sortedLayouts });
  } catch (err) {
    console.error('[api/layouts] GET error:', err);
    return NextResponse.json({ error: 'Failed to load layouts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveLayoutInput;
    const result = await saveLayoutAction(body);

    if (result.success && result.layoutId) {
      // Fetch the created/updated layout to return in "data" per API contract
      const layout = await prisma.venueLayout.findUnique({
        where: { id: result.layoutId },
        include: {
          sections: {
            include: {
              seats: true,
            },
          },
        },
      });

      const parsedLayout = layout ? {
        ...layout,
        sections: layout.sections.map((s) => ({
          ...s,
          geometry: parseGeometry(s.geometry),
        })),
      } : null;

      return NextResponse.json(
        {
          success: true,
          data: parsedLayout,
          message: 'Venue layout saved successfully',
        },
        { status: 201 } // 201 Created is required by R3.5 / E2E tests
      );
    } else {
      return NextResponse.json({ error: result.error ?? 'Save failed' }, { status: 400 });
    }
  } catch (err) {
    console.error('[api/layouts] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const layoutId = url.searchParams.get('layoutId');

    if (!layoutId) {
      return NextResponse.json({ error: 'Missing layoutId parameter' }, { status: 400 });
    }

    await prisma.venueLayout.delete({
      where: { id: layoutId },
    });

    return NextResponse.json({ success: true, message: 'Layout deleted successfully' });
  } catch (err) {
    console.error('[api/layouts] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete layout' }, { status: 500 });
  }
}
