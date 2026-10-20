import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { baseUrl, setToken } from './api';
import '../css/app.css';
import '../css/showroom.css';

// The 3DEEZI app opens the order pages signed in: its sign-in token comes in the address's #app-token= (browsers never
// send the part after # to a server). It is kept like a normal sign-in and removed from the address at once.
const handoff = /(?:^#|&)app-token=([^&]+)/.exec(window.location.hash);
if (handoff) {
  setToken(decodeURIComponent(handoff[1]));
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const basename = baseUrl ? new URL(baseUrl, window.location.origin).pathname.replace(/\/$/, '') : '';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter basename={basename || '/'}><App /></BrowserRouter></React.StrictMode>
);
