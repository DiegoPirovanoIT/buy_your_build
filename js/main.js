// Bootstrap (composition point): loads the settings and the scenario index, wires the router, shows the home.
import * as store from './store.js';
import * as router from './router.js';
import * as settings from './settings.js';
import { loadIndex } from './scenarios.js';

import * as home from './ui/home.js';
import * as settingsScreen from './ui/settings.js';
import * as intro from './ui/intro.js';
import * as auction from './ui/auction.js';
import * as judge from './ui/judge.js';
import * as roundResult from './ui/roundResult.js';
import * as final from './ui/final.js';

const SCREENS = { home, settings: settingsScreen, intro, auction, judge, roundResult, final };

async function boot() {
  const root = document.getElementById('app');
  store.set({ settings: settings.load() });
  router.configure(root, SCREENS);

  try {
    const scenarioIndex = await loadIndex();
    store.set({ scenarioIndex, scenarioIndexError: null });
  } catch (error) {
    console.error('Cannot load the scenario index', error);
    store.set({ scenarioIndex: [], scenarioIndexError: String(error?.message || error) });
  }
  router.showScreen('home');
}

boot();
