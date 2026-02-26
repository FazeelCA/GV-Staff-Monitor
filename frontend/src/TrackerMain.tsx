import React from 'react';
import ReactDOM from 'react-dom/client';
import TrackerCapture from './Tracker';

ReactDOM.createRoot(document.getElementById('tracker-root') as HTMLElement).render(
    <React.StrictMode>
        <TrackerCapture />
    </React.StrictMode>
);
