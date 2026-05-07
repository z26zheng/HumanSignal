import { render } from 'preact';

import { App } from '@/entrypoints/popup/App';

import './style.css';

const appRoot: HTMLElement | null = document.getElementById('app');

if (appRoot === null) {
  throw new Error('HumanSignal popup root was not found.');
}

render(<App />, appRoot);
