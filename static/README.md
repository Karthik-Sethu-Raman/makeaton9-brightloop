# static — the SPA shell (owner: Avanthik)

`index.html` is the single HTML page FastAPI serves at `/`: app shell with the Cadence
mark (copper ring + rim dot, plain SVG) + wordmark, sidebar nav, the page mount, and
script/style tags pulling from `/frontend/...`. Any favicon or brand SVG lives here.
No inline styles beyond critical shell CSS; tokens come from frontend/styles/tokens.css.
