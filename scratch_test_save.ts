async function test() {
  console.log('Sending GET to http://localhost:3000/api/layouts ...');
  const res = await fetch('http://localhost:3000/api/layouts');
  const data = await res.json();
  console.log('Layouts count:', data.data.length);
  data.data.forEach((l: any, idx: number) => {
    console.log(`Index ${idx}:`, l.name, 'Created:', l.createdAt);
  });
}

test().catch(console.error);
