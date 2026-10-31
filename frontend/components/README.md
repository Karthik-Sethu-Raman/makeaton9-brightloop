# frontend/components — reusable renderers (owner: Saurabh)

Native ES modules: `table.js` (right-aligned tabular numbers, 1px row rules, status
pills), `form.js` (label-above fields, blur-time inline errors), `kpi.js` (ONE container
split by 1px rules, no icon circles, no sparklines), `chart.js` (line/bars per DESIGN
chart rules — one hue, 3-5 gridlines, no markers). No frameworks, no build step; import
from pages via relative paths.
