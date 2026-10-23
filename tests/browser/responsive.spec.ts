import {test, expect, type Page, type Locator} from '@playwright/test';

const points = [{lat:40.799,lng:-73.951},{lat:40.799,lng:-73.949},{lat:40.801,lng:-73.949},{lat:40.801,lng:-73.951}];
const elements = Array.from({length:25},(_,i)=>{
  const lat=40.7992+Math.floor(i/5)*.0003, lon=-73.9508+i%5*.0003;
  return {type:'way',id:i+1,tags:{building:'apartments',height:String(15+i*2),name:`Building ${i+1}`},geometry:[{lat,lon},{lat,lon:lon+.00016},{lat:lat+.00016,lon:lon+.00016},{lat:lat+.00016,lon},{lat,lon}]};
});
async function prepare(page:Page) {
  await page.addInitScript(points=>{
    sessionStorage.setItem('map3d.workspace',JSON.stringify({points,location:'Manhattan'}));
    localStorage.setItem('map3d.theme','light');
  },points);
  await page.route('**/*.tile.openstreetmap.org/**',route=>route.fulfill({status:204,body:''}));
  await page.route('**/api/interpreter',route=>route.fulfill({json:{elements:route.request().postData()?.includes('"building"')?elements:[]}}));
}
async function withinScreen(page:Page,locator:Locator) {
  await expect(locator).toBeVisible();
  const box=(await locator.boundingBox())!, size=page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);
  expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);
}
for(const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:667,height:375}]) {
  test(`map, viewer and dashboard remain usable at ${size.width}×${size.height}`,async({page})=>{
    await page.setViewportSize(size);await prepare(page);await page.goto('/map');
    await withinScreen(page,page.locator('.leaflet-container'));
    expect((await page.locator('.leaflet-container').boundingBox())!.height).toBeGreaterThan(200);
    await page.getByRole('button',{name:'Generate 3D scene',exact:true}).click();
    await expect(page.locator('canvas')).toBeVisible();
    await withinScreen(page,page.getByRole('button',{name:'Back to map',exact:true}));
    await withinScreen(page,page.getByRole('toolbar',{name:'Model navigation and measurement'}));
    const expand=page.getByRole('button',{name:'Expand scene layers'});
    if(await expand.isVisible()) await expand.click();
    await expect(page.locator('.layer-hint')).toContainText('Scene ready');
    const list=page.getByRole('region',{name:'Scene layer list'});
    await page.getByRole('checkbox',{name:'Terrain',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('checkbox',{name:'Terrain',exact:true})).toBeInViewport();
    expect(await list.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await withinScreen(page,page.locator('.layer-panel-heading'));
    await page.getByRole('button',{name:'Minimize scene layers'}).click();
    await page.getByRole('button',{name:'Display and export settings'}).click();
    await withinScreen(page,page.locator('#display-settings'));
    await page.getByRole('button',{name:'Dark theme',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.getByRole('button',{name:'Light theme',exact:true}).click();
    await page.getByRole('button',{name:'Download OBJ',exact:true}).scrollIntoViewIfNeeded();
    await withinScreen(page,page.getByRole('button',{name:'Download OBJ',exact:true}));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Display and export settings'})).toBeFocused();
    await page.getByRole('button',{name:'Isometric',exact:true}).click();
    await expect(page.getByRole('button',{name:'Isometric',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:`test-results/responsive-viewer-${size.width}.png`});
    await page.getByRole('button',{name:'Site dashboard',exact:true}).click();
    await expect(page.getByText('All source batches loaded',{exact:true})).toBeVisible();
    await page.getByRole('heading',{name:'Data coverage & methodology'}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading',{name:'Data coverage & methodology'})).toBeInViewport();
    await page.locator('.site-dashboard').evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({path:`test-results/responsive-dashboard-${size.width}.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(size.height);
    await page.getByRole('button',{name:'Back to map',exact:true}).click();
    await expect(page.getByText('Boundary selected')).toBeVisible();
  });
}
test('phone touch drawing expands the map and restores the completed boundary controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(); await prepare(page);await page.goto('/map');
  for(const shape of ['Rectangle','Polygon']) {
    await page.getByRole('button',{name:shape,exact:true}).tap();
    await expect(page.getByRole('button',{name:'Expand map tools'})).toBeVisible();
    const box=(await page.locator('.leaflet-container').boundingBox())!;
    for(const [x,y] of (shape==='Rectangle'?[[.3,.35],[.65,.65]]:[[.3,.35],[.65,.35],[.5,.65]])) await page.touchscreen.tap(box.x+box.width*x,box.y+box.height*y);
    if(shape==='Polygon') await page.getByRole('button',{name:/Finish polygon/}).tap();
    await expect(page.getByRole('button',{name:'Generate 3D scene'})).toBeEnabled();
    await expect(page.getByText('Boundary selected')).toBeVisible();
    await expect.poll(async () => {
      const map=(await page.locator('.leaflet-container').boundingBox())!;
      const boundary=(await page.locator('.boundary-selection').boundingBox())!;
      return boundary.y >= map.y && boundary.y + boundary.height <= map.y + map.height - 40;
    }).toBe(true);
  }
  await page.screenshot({path:'test-results/responsive-map-390.png'});
  await context.close();
});
