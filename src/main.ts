// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";
import { Board, Cell } from "./board.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

interface Coin {
  id: string;
}

interface Cache {
  location: leaflet.LatLng;
  coins: Coin[];
  marker: leaflet.Marker;
}

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
const playerInventory: Coin[] = [];

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerIcon = leaflet.icon({
  iconUrl: "you-are-here.png",
  iconSize: [48, 48],
});

const cacheIcon = leaflet.icon({
  iconUrl: "box.png",
  iconSize: [32, 32],
});

const cacheOpenIcon = leaflet.icon({
  iconUrl: "open-box.png",
  iconSize: [32, 32],
});

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM, { icon: playerIcon });
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "inventory:";

function spawnCache(cell: Cell) {
  const bounds = board.getCellBounds(cell);
  console.log(`Spawning cache at ${bounds.getCenter()}`);

  const rect = leaflet.marker(bounds.getCenter(), { icon: cacheIcon });
  rect.addTo(map);

  const cache: Cache = {
    location: bounds.getCenter(),
    coins: [],
    marker: rect,
  };

  const numberOfCoins = Math.floor(luck([cell.i, cell.j].toString()) * 10);
  for (let k = 0; k < numberOfCoins; k++) {
    const coinId = `${cell.i}:${cell.j}#${k}`;
    cache.coins.push({ id: coinId });
  }

  rect.bindPopup(() => createCachePopupContent(cache));
}

function createCachePopupContent(cache: Cache) {
  const popupDiv = document.createElement("div");
  cache.coins.forEach((coin) => {
    const fixedCoinId = coin.id.replace(/[^a-zA-Z0-9-_]/g, "_");

    const coinDiv = document.createElement("div");
    coinDiv.classList.add("coin-div");
    coinDiv.innerHTML = `
      <span>Coin ID: ${coin.id}</span>
      <button id="collect-${fixedCoinId}">Collect</button>
      `;
    popupDiv.appendChild(coinDiv);

    coinDiv
      .querySelector<HTMLButtonElement>(`#collect-${fixedCoinId}`)!
      .addEventListener("click", () => {
        collectCoin(coin, cache);
        const newPopupContent = createCachePopupContent(cache);
        popupDiv.innerHTML = newPopupContent.innerHTML;
      });
  });

  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = `
  <div><br>Deposit a coin from your inventory:</div>
  <button id="deposit"> Deposit </button>
  `;

  depositDiv
    .querySelector<HTMLButtonElement>("#deposit")!
    .addEventListener("click", () => {
      if (playerInventory.length > 0) {
        const coinToDeposit = playerInventory.shift()!;
        depositCoin(coinToDeposit, cache);
        const newPopupContent = createCachePopupContent(cache);
        popupDiv.innerHTML = newPopupContent.innerHTML;
      } else {
        console.log("No coins in inventory to deposit");
      }
    });
  popupDiv.append(depositDiv);
  return popupDiv;
}

function collectCoin(coin: Coin, cache: Cache) {
  console.log(`Collecting coin ${coin.id}`);
  cache.coins = cache.coins.filter((c) => c.id !== coin.id);
  playerInventory.push(coin);
  updateInventoryDisplay();
  // dispatchEvent(new CustomEvent("cache-updated", { detail: cache }));

  if (cache.coins.length === 0) {
    // const cacheMarker = cache.marker;
    cache.marker.setIcon(cacheOpenIcon);
  }
}

function depositCoin(coin: Coin, cache: Cache) {
  console.log(`Depositing coin ${coin.id}`);
  cache.coins.push(coin);
  updateInventoryDisplay();
  // dispatchEvent(new CustomEvent("cache-updated", { detail: cache }));

  if (cache.coins.length >= 1) {
    const cacheMarker = cache.marker;
    cacheMarker.setIcon(cacheIcon);
  }
}

function updateInventoryDisplay() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `inventory:<br> 
  ${playerInventory.map((coin) => `&nbsp;&nbsp;🪙 ${coin.id}`).join(",<br>")}`;
  // dispatchEvent(new CustomEvent("player-inventory-changed"));
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      const cell = board.getCellForPoint(OAKES_CLASSROOM);
      spawnCache({ i: cell.i + i, j: cell.j + j });
    }
  }
}
