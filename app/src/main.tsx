import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { warmServer } from './assistant/answer';
import './index.css';

warmServer(); // start waking the "Ask the map" backend while the visitor reads the start page

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
