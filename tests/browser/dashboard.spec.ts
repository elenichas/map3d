import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { landUseCategories } from '../../src/data/landUseStyle';
import { poiCategories } from '../../src/data/poiStyle';

const rgb = (hex: string) => `rgb(${hex.slice(1).match(/../g)!.map(value => parseInt(value, 16)).join(', ')})`;

const ring = (x: number, y: number, width: number) => [[x,y],[x+width,y],[x+width,y+width],[x,y+width],[x,y]].map(([lon,lat]) => ({lat:lat/111320,lon:lon/111320}));
const elements = [
  {type:'way',id:1,tags:{building:'yes',height:'12',name:'Library'},geometry:ring(10,10,20)},
  {type:'way',id:2,tags:{building:'yes'},geometry:ring(60,10,10)},
  {type:'way',id:3,tags:{landuse:'grass'},geometry:ring(0,0,100)},
  {type:'way',id:4,tags:{landuse:'residential'},geometry:ring(0,0,100)},
  {type:'node',id:5,tags:{natural:'tree'},lat:50/111320,lon:50/111320},
  {type:'node',id:6,tags:{amenity:'cafe'},lat:40/111320,lon:40/111320},
  {type:'way',id:7,tags:{highway:'residential'},geometry:[{lat:50/111320,lon:-20/111320},{lat:50/111320,lon:120/111320}]},
];
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('map3d.workspace')) sessionStorage.setItem('map3d.workspace',JSON.stringify({location:'Test site',points:[{lat:0,lng:0},{lat:0,lng:100/111320},{lat:100/111320,lng:100/111320},{lat:100/111320,lng:0}]}));
    localStorage.setItem('map3d.theme','light');
  });
  await page.route('**/*.tile.openstreetmap.org/**',route=>route.fulfill({status:204,body:''}));
}
test('dashboard measures the boundary, preserves routes and downloads a report',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let requests=0;
  await seed(page);
  await page.route('**/api/interpreter',route=>{requests++;return route.fulfill({json:{elements}});});
  await page.goto('/map');
  await page.getByRole('button',{name:'Site dashboard',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Site dashboard',exact:true})).toBeVisible();
  await expect(page.getByText('All source batches loaded', {exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Site dashboard'})).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.site-stat').filter({hasText:'Site area'})).toContainText('1ha');
  await expect(page.locator('.site-stat').filter({hasText:'Building coverage'})).toContainText('5%');
  await expect(page.locator('.site-stat').filter({hasText:'Mapped green space'})).toContainText('95%');
  await expect(page.locator('.site-stat').filter({hasText:'Mean building height'})).toContainText('12m');
  await expect(page.getByText('1 unknown, excluded.',{exact:false})).toBeVisible();
  const landUse = page.getByRole('region', { name: 'Land-use designations' });
  const residential = landUse.locator('.site-area-row').filter({ hasText: 'Residential' });
  await expect(residential.locator('.category-badge')).toHaveCSS('background-color', rgb(landUseCategories.residential.color));
  await expect(residential.locator('.category-badge svg')).toHaveClass(/lucide-house/);
  const cafe = page.getByRole('region', { name: 'Amenity types' }).getByRole('term').filter({ hasText: 'Cafés' });
  await expect(cafe.locator('.poi-swatch')).toHaveCSS('background-color', rgb(poiCategories.food.color));
  await expect(cafe.locator('.poi-swatch svg')).toHaveClass(/lucide-coffee/);
  await expect(page.getByRole('heading',{name:'Land-use allocation'})).toBeVisible();
  // Visual cards: site plan, floor area ratio gauge, places as badges, network bars.
  await expect(page.getByRole('img',{name:/^Site plan/})).toBeVisible();
  await expect(page.getByRole('img',{name:/^Site plan/}).locator('path').first()).toBeAttached();
  await expect(page.getByRole('img',{name:/^Indicative floor area ratio/})).toBeVisible();
  await expect(page.getByRole('region',{name:'Amenity types'})).toContainText('Cafés');
  await expect(page.locator('.site-network')).toContainText('Roads');
  await expect(page.locator('.site-network')).toContainText('100 m');
  const sunlight=page.getByRole('region',{name:'Sunlight',exact:true});
  await expect(sunlight.getByRole('img',{name:'Map of direct sunlight hours on open ground'})).toBeVisible({timeout:20000});
  await expect(sunlight).toContainText('of open ground gets 4 h or more of direct sun on the equinox date');
  await sunlight.getByRole('button',{name:'Winter',exact:true}).click();
  await expect(sunlight).toContainText('on the winter date');
  await page.getByRole('button',{name:'m²',exact:true}).click();
  await expect(page.locator('.site-stat').filter({hasText:'Site area'})).toContainText('10,000m²');
  const pdfDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download PDF report',exact:true}).click();
  const pdf=await pdfDownload;
  expect(pdf.suggestedFilename()).toBe('site-report.pdf');
  const pdfBytes=await readFile((await pdf.path())!);
  expect(pdfBytes.subarray(0,5).toString()).toBe('%PDF-');
  expect(pdfBytes.length).toBeGreaterThan(20000);
  await expect(page.getByRole('button',{name:'Download PDF report',exact:true})).toBeEnabled();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download data (JSON)',exact:true}).click();
  const file=await download;
  expect(file.suggestedFilename()).toBe('site-analysis.json');
  const report=JSON.parse(await readFile((await file.path())!,'utf8'));
  expect(report.metrics.buildings.count).toBe(2);
  expect(report.metrics.buildings.unknownHeights).toBe(1);
  expect(report.metrics.area).toBeCloseTo(10000,2);
  expect(report.metrics.lengths.roads).toBeCloseTo(100,2);
  expect(report.partial).toBe(false);
  await page.getByRole('button',{name:'View in 3D'}).click();
  await expect(page).toHaveURL(/\/viewer$/);
  await expect(page.locator('.layer-hint')).toContainText('Scene ready');
  await page.getByRole('checkbox',{name:'Buildings',exact:true}).uncheck();
  await page.getByRole('button',{name:'Site dashboard',exact:true}).click();
  await expect(page.locator('.site-stat').filter({hasText:'Building coverage'})).toContainText('5%');
  expect(requests).toBe(4); // Dashboard / viewer navigation reuses the loaded sources.
  await page.getByRole('button',{name:'Back to map',exact:true}).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByText('Boundary selected')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Site dashboard',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
test('dashboard updates progressively and missing landscape is not shown as zero',async({page})=>{
  await seed(page);
  let release:()=>void=()=>{};
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/interpreter',async route=>{
    const query=route.request().postData() || '';
    if(query.includes('landuse')) await waiting;
    return route.fulfill({json:{elements:query.includes('"building"')?elements.slice(0,2):query.includes('landuse')?elements.slice(2,5):[]}});
  });
  await page.goto('/dashboard');
  await expect(page.locator('.site-stat').filter({hasText:'Building coverage'})).toContainText('5%');
  await expect(page.getByText('Partial mapped data',{exact:true})).toBeVisible();
  await expect(page.locator('.site-stat').filter({hasText:'Mapped green space'})).toContainText('—');
  await page.getByRole('button',{name:'Stop loading layers',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry unavailable layers',exact:true})).toBeVisible();
  release();
  await page.getByRole('button',{name:'Retry unavailable layers',exact:true}).click();
  await expect(page.getByText('All source batches loaded',{exact:true})).toBeVisible();
  await expect(page.locator('.site-stat').filter({hasText:'Mapped green space'})).toContainText('95%');
});
test('dashboard scrolls on mobile, supports dark theme and handles an empty boundary',async({page})=>{
  await seed(page);
  await page.route('**/api/interpreter',route=>route.fulfill({json:{elements:[]}}));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/dashboard');
  await expect(page.getByText('All source batches loaded',{exact:true})).toBeVisible();
  await expect(page.locator('.site-stat').filter({hasText:'Mean building height'})).toContainText('—');
  await page.getByRole('button',{name:'Display and export settings'}).click();
  await page.getByRole('button',{name:'Dark theme'}).click();
  await page.getByRole('button',{name:'Close display settings'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.locator('.site-dashboard').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await page.getByRole('heading',{name:'Data coverage & methodology'}).scrollIntoViewIfNeeded();
  await expect(page.getByText('Verify findings independently and use at your own risk.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Back to map',exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Back to map',exact:true}).click();
  await page.getByRole('button',{name:'Clear boundary'}).click();
  await expect(page.getByRole('button',{name:'Site dashboard',exact:true})).toBeDisabled();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/map$/);
});
