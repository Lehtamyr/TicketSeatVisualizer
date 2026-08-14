const TEST_URL = 'http://localhost:3000/api/layouts';

async function main() {
  // 1. Create layout
  const res1 = await fetch(TEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Edit Layout',
      canvasWidth: 1000,
      canvasHeight: 700,
      sections: [{
        name: 'Sec 1', code: 'S1', shapeType: 'RECTANGLE',
        geometry: { shapeType: 'RECTANGLE', points: [], clipToBoundary: false },
        price: 100, color: '#f00', rowCount: 1, seatsPerRow: 1, seats: []
      }],
      pricingTiers: [{ id: 'tier-test', name: 'Test Tier', color: '#f00', basePrice: 100 }]
    })
  });
  const data1 = await res1.json();
  const layoutId = data1.data.id;
  
  // 2. Edit layout and assign tier
  const res2 = await fetch(TEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      layoutId,
      name: 'Test Edit Layout 2',
      canvasWidth: 1000,
      canvasHeight: 700,
      sections: [{
        name: 'Sec 1', code: 'S1', shapeType: 'RECTANGLE',
        geometry: { shapeType: 'RECTANGLE', points: [], clipToBoundary: false },
        price: 100, color: '#f00', rowCount: 1, seatsPerRow: 1, seats: [],
        tierId: data1.data.pricingTiers ? data1.data.pricingTiers[0]?.id : 'tier-test'
      }],
      pricingTiers: data1.data.pricingTiers || [{ id: 'tier-test', name: 'Test Tier', color: '#f00', basePrice: 100 }]
    })
  });
  const data2 = await res2.json();
  console.log(JSON.stringify(data2, null, 2));
}

main().catch(console.error);
