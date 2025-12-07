import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import { apiFetch } from '../api';

function Dashboard() {
  const [recentActivity, setRecentActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecentActivity();
  }, []);

  const loadRecentActivity = async () => {
    try {
      const [notesResponse, filesResponse] = await Promise.all([
        apiFetch('/notes'),
        apiFetch('/files')
      ]);

      const notes = notesResponse.ok ? await notesResponse.json() : [];
      const files = filesResponse.ok ? await filesResponse.json() : [];
      
      // Combine and sort by date (most recent first)
      const activities = [
        ...notes.map(note => ({
          id: note.id,
          type: 'note',
          title: note.title,
          date: note.createdAt,
          icon: '📝'
        })),
        ...files.map(file => ({
          id: file.id,
          type: 'file',
          title: file.name,
          date: file.uploadedAt,
          icon: '📄'
        }))
      ];
      
      activities.sort((a, b) => new Date(b.date) - new Date(a.date));
      setRecentActivity(activities.slice(0, 5)); // Show only last 5
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error loading recent activity:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      <div className="dashboard-cards">
        <div className="card">
          <h3>Create & Upload</h3>
          <p>Add notes and upload files to your cloud storage</p>
          <Link to="/create" className="card-btn">
            Go to Create
          </Link>
        </div>
        
        <div className="card">
          <h3>View & Manage</h3>
          <p>View your notes and files, get summaries and downloads</p>
          <Link to="/view" className="card-btn">
            Go to View
          </Link>
        </div>
      </div>
      
      <div className="quick-stats">
        <div className="stat">
          <h4>Recent Activity</h4>
          {isLoading ? (
            <p>Loading recent activity...</p>
          ) : recentActivity.length > 0 ? (
            <div className="activity-list">
              {recentActivity.map((activity, index) => (
                <div key={activity.id} className="activity-item">
                  <span className="activity-icon">{activity.icon}</span>
                  <div className="activity-details">
                    <span className="activity-title">{activity.title}</span>
                    <span className="activity-type">{activity.type}</span>
                    <span className="activity-date">
                      {new Date(activity.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No recent activity found</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;