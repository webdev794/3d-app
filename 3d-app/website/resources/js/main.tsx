import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { baseUrl } from './api';
import '../css/app.css';
import '../css/showroom.css';

const basename = baseUrl ? new URL(baseUrl, window.location.origin).pathname.replace(/\/$/, '') : '';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter basename={basename || '/'}><App /></BrowserRouter></React.StrictMode>
);
