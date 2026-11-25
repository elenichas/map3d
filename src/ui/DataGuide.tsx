import { useRef } from 'react';
import { BookOpen, X } from 'lucide-react';

export function DataGuide() {
  const dialog = useRef<HTMLDialogElement>(null);

  return <>
    <button className="data-guide-trigger" aria-haspopup="dialog" aria-controls="data-guide" onClick={() => dialog.current?.showModal()}><BookOpen size={14}/>Data & guide</button>
    <dialog id="data-guide" className="data-guide" ref={dialog} aria-labelledby="data-guide-title" aria-describedby="data-guide-summary"
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
      }}>
      <div className="data-guide-header">
        <div><h2 id="data-guide-title">From map data to 3D</h2><p id="data-guide-summary">A quick guide to sources, geometry, and accuracy.</p></div>
        <button autoFocus aria-label="Close data guide" onClick={() => dialog.current?.close()}><X size={19}/></button>
      </div>
      <div className="data-guide-content">
        <aside className="data-guide-warning" aria-label="Data accuracy notice">
          <strong>Use at your own risk</strong>
          <p>Data may be missing, outdated, or incorrect. Geometry and measurements may be estimated or simplified; accuracy is not guaranteed. Use this app and its exports at your own risk. Verify important details independently.</p>
        </aside>
        <section aria-labelledby="guide-sources">
          <h3 id="guide-sources">Where the data comes from</h3>
          <p>Map features come from <a href="https://www.openstreetmap.org/about" target="_blank" rel="noreferrer">OpenStreetMap</a>, a community-maintained map, queried for your boundary through the <a href="https://wiki.openstreetmap.org/wiki/Overpass_API" target="_blank" rel="noreferrer">Overpass API</a>. Location search uses Nominatim; the 2D map uses OpenStreetMap tiles.</p>
          <p>Optional terrain uses Mapzen Terrarium elevation tiles. <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">See elevation sources and credits.</a></p>
        </section>
        <section aria-labelledby="guide-geometry">
          <h3 id="guide-geometry">How geometry is built</h3>
          <ol>
            <li>Map coordinates become local coordinates in metres. Land-use areas are drawn flat on the ground in zoning-map colours with a darker outline. Buildings can be coloured by use: a building's own mapped type comes first, otherwise it takes the smallest land-use area containing its centre. Area outlines become surfaces; roads and paths become lines; trees use symbolic markers. Street furniture such as benches, bins, drinking water and toilets appears as simple objects at 1.5× real size, turned to the mapped direction where one is given. Other places get a marker post with an icon badge, coloured by category (food, bars, shops, banks, health, education, arts, tourism, sport, community, cars and transport).</li>
            <li>In Scene layers, places, land use and buildings are grouped into these same categories. Each group has the colour and icon used in the 3D view, and one checkbox to show or hide all of its types; expand it to toggle single types.</li>
            <li>Building footprints are extruded using mapped heights. Missing heights are estimated at 3 m per floor, or 10 m when no floor count exists. Gabled, hipped, half-hipped, pyramidal, gambrel, mansard, skillion, barrel, dome, onion and cone roofs are rebuilt from <code>roof:shape</code>, with a typical height when <code>roof:height</code> is missing; other shapes appear flat.</li>
            <li>Floor lines mark each storey from <code>building:levels</code>, or one every 3 m when only a height is mapped. Churches, towers and halls without a floor count get no lines. Turn them off with <strong>Floors</strong> under Buildings.</li>
            <li>With terrain enabled, sampled elevation shapes the ground and positions features. The result is an approximation, not a surveyed model.</li>
          </ol>
        </section>
        <section aria-labelledby="guide-coverage">
          <h3 id="guide-coverage">Reading the scene</h3>
          <p>Layers load progressively and temporary failures retry in the background. “No mapped data” means no supported features were returned, not that none exist. Unavailable or incomplete layers can leave gaps. Measurements and downloads reflect the loaded model, including its estimates.</p>
          <p>Rhino (3DM) downloads include all loaded geometry, with nested layers and visibility settings, in metres with Z up. Buildings and surfaces are meshes; paths are editable curves. GLB and OBJ downloads include visible geometry only.</p>
        </section>
        <section aria-labelledby="guide-origin">
          <h3 id="guide-origin">Project & credits</h3>
          <p>This app is <a href="https://github.com/elenichas/map3d" target="_blank" rel="noreferrer">elenichas/map3d</a>, a fork of <a href="https://github.com/cartesiancs/map3d" target="_blank" rel="noreferrer">cartesiancs/map3d</a>. The original project is MIT licensed.</p>
          <p>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">Open Database License (ODbL)</a>.</p>
        </section>
      </div>
    </dialog>
  </>;
}
