const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/layouts');
  const json = await res.json();
  if (json.data && json.data.length > 0) {
    console.log("Pricing tiers:", json.data[0].pricingTiers?.map(t => t.id));
    console.log("Section tierIds:", json.data[0].sections?.map(s => ({name: s.name, pricingTierId: s.pricingTierId})));
  }
}
test();
