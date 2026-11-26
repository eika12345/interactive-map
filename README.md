# Interactive Map

A lightweight, dependency-free interactive map with filterable listings. Drop in one JS file and one CSS file, point it at an image of your map and a list of places, and you get clickable pins, category filters, a synced card list, pinch-to-zoom and shareable links.

No frameworks, no build step, no API keys.

<!-- TODO: replace with a screenshot or short GIF of the demo -->
![Interactive map demo](screenshot.png)

**[Live demo →](https://example.com)** <!-- TODO: add your demo link -->

---

## Features

- **Filterable pins and list.** Category checkboxes filter both the map and the card list at once, with a live count.
- **Popups and cards linked both ways.** Click a pin to see details, "Read more" jumps to its card, and "Show on map" opens the pin.
- **Pinch-to-zoom and pan.** Works with touch, mouse and pen through Pointer Events. On phones, one finger at normal zoom still scrolls the page.
- **Desktop zoom.** Drag to pan, double-click to zoom, Ctrl/Cmd + wheel or trackpad pinch, plus +, − and reset buttons.
- **Keyboard accessible.** Tab to the map, then arrow keys pan (Shift for bigger steps), + and − zoom, 0 resets. Escape closes popups.
- **Screen reader friendly.** Labelled regions, buttons and pins, a live result count, and a usage hint on the map.
- **Shareable links (optional).** Active filters and the open pin are saved in the URL, so a link restores the exact view.
- **Stats bar (optional).** Show totals such as number of places, sum of distances or highest elevation for the visible items.
- **Grouped pins.** Places at the same coordinates merge into one numbered pin.
- **Load data from JSON.** Pass an array or a URL to a JSON file.
- **Themeable.** Colours and font through config or CSS custom properties.
- **Edit mode.** Click the map to get x/y coordinates copied to your clipboard while placing pins.
- **Clean teardown.** `destroy()` removes every listener it added.

---

## Quick start

```html
<link rel="stylesheet" href="interactive-map.css">

<div id="map"></div>

<script src="interactive-map.js"></script>
<script>
  InteractiveMap.mount('#map', {
    map: { image: 'map.svg', width: 1000, height: 600, alt: 'Map of the old town' },
    categories: {
      cafe:  { label: 'Cafés',    color: '#c0713a' },
      park:  { label: 'Parks',    color: '#3a8f5c' }
    },
    items: [
      { title: 'Corner Café', category: 'cafe', x: 420, y: 310, description: 'Great espresso.' },
      { title: 'River Park',  category: 'park', x: 700, y: 150 }
    ]
  });
</script>
```

The map is an image you supply (SVG, PNG or JPG), such as an illustrated map, a floor plan or a venue layout. It is not a tile map like Google Maps or Leaflet, which is what keeps it small and free of API keys.

---

## Placing pins

Pin positions are `x` and `y` in the image's own pixel coordinates, measured against `map.width` and `map.height`.

To find them, turn on edit mode by adding `?edit` to the page URL (or setting `edit: true`), then click anywhere on the map. The coordinates are shown and copied to your clipboard as `"x": 420, "y": 310`, ready to paste into your data.

---

## Data

Each item needs `title`, `category`, `x` and `y`. Everything else is optional.

| Field         | Description                                      |
| ------------- | ------------------------------------------------ |
| `title`       | Name shown on the card, popup and pin label      |
| `category`    | Key from `categories`                            |
| `x`, `y`      | Position in image pixels                         |
| `description` | Paragraph on the card                            |
| `image`       | Card image URL (lazy-loaded)                     |
| `imageAlt`    | Alt text for the card image                      |
| *any other*   | Custom fields you can display with `fields`      |

Items can also come from a JSON file, as an array or as `{ "items": [...] }`:

```js
InteractiveMap.mount('#map', { ...config, items: 'data/places.json' });
```

A loading message shows while it fetches, and an error message if it fails.

---

## Options

| Option       | Type                    | Description |
| ------------ | ----------------------- | ----------- |
| `map`        | object, **required**    | `{ image, width, height, alt }` |
| `categories` | object, **required**    | `{ key: { label, color } }` |
| `items`      | array or string         | Array of items, or a URL to a JSON file |
| `fields`     | array                   | Extra item fields to show on cards and popups: `[{ key, label, suffix }]` |
| `stats`      | array                   | Stats bar entries: `[{ type, field, label, suffix }]`. `type` is `'count'` (default), `'sum'` or `'max'` |
| `theme`      | object                  | `{ accent, bg, ink, panel, line, font }` |
| `labels`     | object                  | Override any UI text (see below) |
| `zoom`       | `false` or object       | `false` turns off zoom and pan. `{ max: 6 }` sets the max zoom (default 4) |
| `urlState`   | `true` or object        | Save filters and the open pin in the URL. Use `{ key: 'venues' }` for several maps on one page |
| `edit`       | boolean                 | Force edit mode on or off (default: on when the URL has `?edit`) |
| `onSelect`   | function                | Called with the array of items when a pin opens |

### Example with fields and stats

```js
InteractiveMap.mount('#map', {
  map: { image: 'trails.svg', width: 1200, height: 800 },
  categories: {
    easy: { label: 'Easy', color: '#4caf50' },
    hard: { label: 'Hard', color: '#e53935' }
  },
  fields: [
    { key: 'distance', suffix: ' km' },
    { key: 'elevation', label: 'Climb', suffix: ' m' }
  ],
  stats: [
    { type: 'count', label: 'Trails' },
    { type: 'sum', field: 'distance', label: 'Total distance', suffix: ' km' },
    { type: 'max', field: 'elevation', label: 'Highest climb', suffix: ' m' }
  ],
  items: 'trails.json',
  urlState: true
});
```

### Labels

All text can be changed, for example for translations:

`filters`, `show`, `read`, `empty`, `loading`, `error`, `close`, `places`, `mapLabel`, `zoomIn`, `zoomOut`, `zoomReset`, `mapHelp`

```js
labels: { show: 'Ver en el mapa', read: 'Leer más', places: 'lugares' }
```

### Theming

Pass colours through `theme`, or set the CSS custom properties directly:

```css
#map {
  --im-accent: #0a7cff;
  --im-bg: #ffffff;
  --im-ink: #1a1a1a;
  --im-panel: #f6f6f6;
  --im-line: #dddddd;
  --im-font: system-ui, sans-serif;
}
```

---

## Methods

`mount()` returns the map instance:

```js
const map = InteractiveMap.mount('#map', config);

map.ready.then(() => { /* data loaded */ });
map.setItems(newItems);   // replace the data at runtime
map.destroy();            // remove the map and all its listeners
```

---

## Shareable links

With `urlState: true`, the URL hash stores:

- `im.cats=cafe,park`: active filters (only added when at least one is off)
- `im.item=2`: the open pin, by its index in `items`

Other hash parameters are kept, and back/forward navigation updates the map. Because the pin is saved by index, reordering or removing items changes what old links point to.

---

## Keyboard

| Key                  | Action                        |
| -------------------- | ----------------------------- |
| Tab                  | Move to the map, buttons, pins |
| Arrow keys           | Pan (when zoomed in)          |
| Shift + arrows       | Pan in larger steps           |
| + / =                | Zoom in                       |
| −                    | Zoom out                      |
| 0                    | Reset zoom                    |
| Enter / Space on pin | Open popup                    |
| Escape               | Close popup                   |

---

## Browser support

Current versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. It uses Pointer Events, `fetch`, `URLSearchParams` and CSS `aspect-ratio`. Internet Explorer is not supported.

---

## License

MIT
