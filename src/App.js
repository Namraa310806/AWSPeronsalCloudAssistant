import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import './App.css';
import Dashboard from './components/Dashboard';
import CreateNote from './components/CreateNote';
import ViewNotes from './components/ViewNotes';
import Monitoring from './components/Monitoring';

function App() {
  const adminEmail = process.env.REACT_APP_ADMIN_EMAIL;

  return (
    <Authenticator
      loginMechanisms={['email']}
      signUpAttributes={['email']}
    >
      {({ signOut, user }) => {
        const adminEmailNormalized = adminEmail?.toLowerCase();
        const userEmail = user?.attributes?.email || user?.signInDetails?.loginId || user?.username;
        const userEmailNormalized = userEmail?.toLowerCase();
        const isAdmin = Boolean(adminEmailNormalized && userEmailNormalized && userEmailNormalized === adminEmailNormalized);

        if (process.env.NODE_ENV !== 'production') {
          // Debug hint (visible in dev console only)
          console.log('Admin check', { adminEmailNormalized, userEmailNormalized, isAdmin });
        }
        return (
          <Router>
            <div className="App">
              <header className="app-header">
                <h1>Personal Cloud Assistant</h1>
                <div className="user-info">
                  <span>Welcome</span>
                  <button onClick={signOut} className="sign-out-btn">
                    Sign Out
                  </button>
                </div>
              </header>
              
              <main className="app-main">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/create" element={<CreateNote />} />
                  <Route path="/view" element={<ViewNotes />} />
                  <Route path="/monitoring" element={<Monitoring />} />
                </Routes>
              </main>
              
              {isAdmin && (
                <Link to="/monitoring" className="monitoring-fab" title="View Monitoring">
                  📊
                </Link>
              )}
            </div>
          </Router>
        );
      }}
    </Authenticator>
  );
}

export default App;
