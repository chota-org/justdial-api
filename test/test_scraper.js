import { searchJustdial, resolveCategory } from '../src/scrapers/justdial.js';
import { searchGrotal } from '../src/scrapers/grotal.js';
import { searchIndiaMart } from '../src/scrapers/indiamart.js';
import { searchTradeIndia } from '../src/scrapers/tradeindia.js';
import { searchSulekha } from '../src/scrapers/sulekha.js';
import { searchAllSources } from '../src/scrapers/index.js';

async function runTests() {
  console.log('=== Test 1: Category Resolution (Justdial) ===');
  const cat = await resolveCategory('Mumbai', 'Solar-Panel-Dealers');
  console.log('Resolved category:', cat);
  if (!cat.ncatid) throw new Error('Failed to resolve ncatid');
  console.log('✓ Test 1 Passed!\n');

  console.log('=== Test 2: Grotal Scraper ===');
  const grotalRes = await searchGrotal({ city: 'Delhi', query: 'Caterers', limit: 5 });
  console.log(`Grotal returned ${grotalRes.total_results} leads.`);
  if (grotalRes.total_results === 0) throw new Error('Grotal returned zero results');
  console.log(`  Sample: ${grotalRes.results[0].name} | Phone: ${grotalRes.results[0].phone}`);
  console.log('✓ Test 2 Passed!\n');

  console.log('=== Test 3: IndiaMART Scraper ===');
  const imRes = await searchIndiaMart({ city: 'Delhi', query: 'solar panel', limit: 5 });
  console.log(`IndiaMART returned ${imRes.total_results} leads.`);
  if (imRes.total_results === 0) throw new Error('IndiaMART returned zero results');
  console.log(`  Sample: ${imRes.results[0].name} | Phone: ${imRes.results[0].phone}`);
  console.log('✓ Test 3 Passed!\n');

  console.log('=== Test 4: TradeIndia Scraper ===');
  const tiRes = await searchTradeIndia({ city: 'Delhi', query: 'solar panel', limit: 5 });
  console.log(`TradeIndia returned ${tiRes.total_results} leads.`);
  if (tiRes.total_results === 0) throw new Error('TradeIndia returned zero results');
  console.log(`  Sample: ${tiRes.results[0].name} | Website: ${tiRes.results[0].website || 'N/A'}`);
  console.log('✓ Test 4 Passed!\n');

  console.log('=== Test 5: Multi-Platform Aggregator (searchAllSources) ===');
  const allRes = await searchAllSources({
    city: 'Delhi',
    query: 'Caterers',
    limit: 10,
    sources: ['grotal', 'indiamart', 'tradeindia', 'sulekha']
  });
  console.log(`Aggregator returned ${allRes.total_deduplicated} deduplicated leads across platforms.`);
  console.log('Status by source:', allRes.sources_status);
  if (allRes.total_deduplicated === 0) throw new Error('Aggregator returned zero results');
  console.log('✓ Test 5 Passed!\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
