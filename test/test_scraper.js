import { searchJustdial, resolveCategory } from '../src/scraper/justdial.js';

async function runTests() {
  console.log('=== Test 1: Category Resolution ===');
  const cat = await resolveCategory('Mumbai', 'Solar-Panel-Dealers');
  console.log('Resolved category:', cat);
  if (!cat.ncatid) throw new Error('Failed to resolve ncatid');
  console.log('✓ Test 1 Passed!\n');

  console.log('=== Test 2: Search Justdial Leads ===');
  const results = await searchJustdial({
    city: 'Mumbai',
    query: 'Solar-Panel-Dealers',
    pages: 2,
    limit: 15
  });

  console.log('Query:', results.query);
  console.log('Meta:', results.meta);
  console.log(`Leads returned: ${results.results.length}`);
  results.results.slice(0, 3).forEach((r, idx) => {
    console.log(`  [${idx + 1}] ${r.name}`);
    console.log(`      Phone: ${r.phone || 'NONE'}`);
    console.log(`      Address: ${r.address}`);
    console.log(`      Area: ${r.area}, City: ${r.city}`);
    console.log(`      Rating: ${r.rating} (${r.reviews} reviews)`);
    console.log(`      Verified: ${r.verified} | Paid: ${r.paid}`);
  });

  if (results.results.length === 0) throw new Error('Zero results returned');
  if (results.meta.with_phone_count === 0) throw new Error('Zero phone numbers returned');
  console.log('\n✓ Test 2 Passed: Successfully extracted leads with unmasked phone numbers!\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
