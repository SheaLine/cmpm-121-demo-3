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
  cell: Cell;
  coins: Coin[];
  marker: leaflet.Marker;
  toMemento(): string;
  fromMemento(memento: string): void;
  refreshMemento(): void;
}

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
const playerInventory: Coin[] = [];
const visibleCaches: string[] = [];

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

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM, { icon: playerIcon });
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "inventory:";

function spawnCache(cell: Cell): Cache {
  const bounds = board.getCellBounds(cell);
  console.log(`Spawning cache at ${bounds.getCenter()}`);

  const rect = leaflet.marker(bounds.getCenter(), { icon: cacheIcon });
  rect.addTo(map);
  const cache: Cache = {
    cell: cell,
    coins: [],
    marker: rect,
    toMemento() {
      return JSON.stringify({
        coins: this.coins,
        cell: this.cell,
      });
    },
    fromMemento(memento: string) {
      const data = JSON.parse(memento);
      this.coins = data.coins;
      this.cell = data.cell;
    },
    refreshMemento() {
      for (let i = 0; i < visibleCaches.length; i++) {
        const currCache: Cache = JSON.parse(visibleCaches[i]) as Cache;
        if (
          this.cell.i == currCache.cell.i &&
          this.cell.j == currCache.cell.j
        ) {
          visibleCaches[i] = this.toMemento();
        }
      }
    },
  };
  // Check if there is a saved state for this cache
  const savedMemento = localStorage.getItem(`cache_${cell.i}_${cell.j}`);
  if (savedMemento) {
    cache.fromMemento(savedMemento);
  } else {
    const numberOfCoins = Math.floor(luck([cell.i, cell.j].toString()) * 100);
    for (let k = 0; k < numberOfCoins; k++) {
      const coinId = `${cell.i}:${cell.j}#${k}`;
      cache.coins.push({ id: coinId });
    }
    // Save the initial state of the cache
    localStorage.setItem(`cache_${cell.i}_${cell.j}`, cache.toMemento());
  }

  rect.bindPopup(() => createCachePopupContent(cache));
  return cache;
}

function createCachePopupContent(cache: Cache) {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div class="cache-title">Cache at ${cache.cell.i}, ${cache.cell.j}</div>
  `;
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
  <button id="collect-all"> Collect All </button>
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
  depositDiv
    .querySelector<HTMLButtonElement>("#collect-all")!
    .addEventListener("click", () => {
      collectAll(cache);
      const newPopupContent = createCachePopupContent(cache);
      popupDiv.innerHTML = newPopupContent.innerHTML;
    });
  popupDiv.append(depositDiv);
  return popupDiv;
}

function collectCoin(coin: Coin, cache: Cache) {
  console.log(`Collecting coin ${coin.id}`);
  cache.coins = cache.coins.filter((c) => c.id !== coin.id);
  playerInventory.push(coin);
  updateInventoryDisplay();
  cache.refreshMemento();
}

function collectAll(cache: Cache) {
  console.log(`Collecting all coins in cache ${cache.cell.i}: ${cache.cell.j}`);
  playerInventory.push(...cache.coins);
  cache.coins = [];
  updateInventoryDisplay();
  cache.refreshMemento();
}

function depositCoin(coin: Coin, cache: Cache) {
  console.log(`Depositing coin ${coin.id}`);
  cache.coins.push(coin);
  updateInventoryDisplay();
  cache.refreshMemento();
  if (cache.coins.length >= 1) {
    const cacheMarker = cache.marker;
    cacheMarker.setIcon(cacheIcon);
  }
}

function updateInventoryDisplay() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `inventory:<br> 
  ${playerInventory.map((coin) => `&nbsp;&nbsp;🪙 ${coin.id}`).join(",<br>")}`;
}

const movementHistory: leaflet.LatLng[] = []; // Store positions for polyline
const movementPolyline = leaflet
  .polyline(movementHistory, {
    color: "red",
    weight: 6,
    opacity: 1,
  })
  .addTo(map);

// Add event listeners for movement buttons
document
  .getElementById("north")!
  .addEventListener("click", () => movePlayer(TILE_DEGREES, 0));
document
  .getElementById("south")!
  .addEventListener("click", () => movePlayer(-TILE_DEGREES, 0));
document
  .getElementById("west")!
  .addEventListener("click", () => movePlayer(0, -TILE_DEGREES));
document
  .getElementById("east")!
  .addEventListener("click", () => movePlayer(0, TILE_DEGREES));

function movePlayer(dLat: number, dLng: number) {
  const currentLatLng = playerMarker.getLatLng();
  const newLatLng = leaflet.latLng(
    currentLatLng.lat + dLat,
    currentLatLng.lng + dLng,
  );
  playerMarker.setLatLng(newLatLng);
  map.panTo(newLatLng);

  movementHistory.push(newLatLng);
  movementPolyline.setLatLngs(movementHistory);

  clearCaches();
  updateVisibleCaches(newLatLng);
  savePlayerState();
}

function clearCaches() {
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Marker && layer !== playerMarker) {
      map.removeLayer(layer);
    }
  });
}
// inspired by peer https://github.com/sym-z/cmpm-121-demo-3/blob/main/src/main.ts#L179
function updateVisibleCaches(playerPosition: leaflet.LatLng) {
  clearCaches();
  // Get new set of cells near the player's position
  const nearbyCells = board.getCellsNearPoint(playerPosition);

  // Spawn caches in the new set of cells
  nearbyCells.forEach((cell) => {
    let duplicate = false;
    if (luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY) {
      const currentCache: Cache = spawnCache(cell);
      for (const cache of visibleCaches) {
        currentCache.fromMemento(cache);

        if (currentCache.cell.i === cell.i && currentCache.cell.j === cell.j) {
          duplicate = true;
          visibleCaches.push(cache);
          break;
        }
      }
      if (!duplicate) {
        console.log("Adding new cache to visibleCaches");
        const newCache = spawnCache(cell);
        visibleCaches.push(newCache.toMemento());
      }
    }
  });
}

let geolocationWatchId: number | null = null;

document.getElementById("sensor")!.addEventListener("click", () => {
  if (geolocationWatchId === null) {
    // Start watching the geolocation
    geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        movePlayer(
          latitude - playerMarker.getLatLng().lat,
          longitude - playerMarker.getLatLng().lng,
        );
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000,
      },
    );
    console.log("Geolocation tracking enabled");
  } else {
    // Stop watching the geolocation
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
    console.log("Geolocation tracking disabled");
  }
});

document.getElementById("reset")!.addEventListener("click", () => {
  const confirmation = prompt(
    "Are you sure you want to erase your game state? Type 'yes' to confirm.",
  );
  if (confirmation?.toLowerCase() === "yes") {
    resetGameState();
  }
});

function savePlayerState() {
  const playerLatLng = playerMarker.getLatLng();
  const playerState = {
    playerLat: playerLatLng.lat,
    playerLng: playerLatLng.lng,
    playerCoins: playerInventory,
    cacheMementos: visibleCaches,
    movementHistory: movementHistory.map((latLng) => [latLng.lat, latLng.lng]), // Save latLng points
  };
  localStorage.setItem("playerState", JSON.stringify(playerState));
}

function loadPlayerState() {
  const savedState = localStorage.getItem("playerState");
  if (savedState) {
    const playerState = JSON.parse(savedState);

    // Restore player position
    const playerLatLng = leaflet.latLng(
      playerState.playerLat,
      playerState.playerLng,
    );
    playerMarker.setLatLng(playerLatLng);
    map.panTo(playerLatLng);

    // Restore player inventory
    playerInventory.length = 0; // Clear current inventory
    playerInventory.push(...playerState.playerCoins);
    updateInventoryDisplay();

    // Restore visible caches
    visibleCaches.length = 0; // Clear current visible caches
    visibleCaches.push(...playerState.cacheMementos);
    visibleCaches.forEach((cacheMemento) => {
      const cacheData = JSON.parse(cacheMemento);
      const cell = cacheData.cell;
      const cache = spawnCache(cell);
      cache.fromMemento(cacheMemento);
    });

    // Restore movement history
    movementHistory.length = 0; // Clear current movement history
    movementHistory.push(
      ...playerState.movementHistory.map((latLng: [number, number]) =>
        leaflet.latLng(latLng[0], latLng[1])
      ),
    );
    movementPolyline.setLatLngs(movementHistory);
  }
}

function resetGameState() {
  // Clear player inventory
  playerInventory.length = 0;
  updateInventoryDisplay();

  // Clear visible caches
  clearCaches();

  // Clear movement history
  movementHistory.length = 0;
  movementPolyline.setLatLngs([]);

  // Clear localStorage
  localStorage.removeItem("playerState");

  // Optionally, reset player position to the initial position
  const initialPosition = OAKES_CLASSROOM;
  playerMarker.setLatLng(initialPosition);
  map.panTo(initialPosition);

  console.log("Game state has been reset.");
}

// updateVisibleCaches(OAKES_CLASSROOM);
loadPlayerState();
