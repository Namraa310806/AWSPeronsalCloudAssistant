import React, { useState, useEffect, useMemo } from 'react';
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { fetchAuthSession } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';
import './Monitoring.css';

const Monitoring = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    notesOperations: 0,
    filesOperations: 0,
    summarizeOperations: 0,
    errors: 0,
    avgDuration: 0,
    lastUpdated: null,
    loading: true,
    health: 'healthy'
  });

  const cloudwatch = useMemo(async () => {
    const session = await fetchAuthSession();
    return new CloudWatchClient({
      region: 'ap-south-1',
      credentials: session.credentials
    });
  }, []);

  // Fetch metrics from CloudWatch
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const cwClient = await cloudwatch;
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 3600000); // Last 1 hour

        // Fetch different metrics
        const notesCmd = new GetMetricStatisticsCommand({
          Namespace: 'PersonalCloudAssistant/Notes',
          MetricName: 'NotesCreated',
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ['Sum']
        });

        const filesCmd = new GetMetricStatisticsCommand({
          Namespace: 'PersonalCloudAssistant/Files',
          MetricName: 'FilesUploaded',
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ['Sum']
        });

        const errorsCmd = new GetMetricStatisticsCommand({
          Namespace: 'PersonalCloudAssistant/Notes',
          MetricName: 'Errors',
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ['Sum']
        });

        const durationCmd = new GetMetricStatisticsCommand({
          Namespace: 'PersonalCloudAssistant/Notes',
          MetricName: 'RequestDuration',
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ['Average']
        });

        const [notesRes, filesRes, errorsRes, durationRes] = await Promise.all([
          cwClient.send(notesCmd),
          cwClient.send(filesCmd),
          cwClient.send(errorsCmd),
          cwClient.send(durationCmd)
        ]);

        const notesOps = notesRes.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
        const filesOps = filesRes.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
        const errorCount = errorsRes.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
        const avgDur = durationRes.Datapoints?.length > 0 
          ? durationRes.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / durationRes.Datapoints.length 
          : 0;

        const health = errorCount > 5 ? 'degraded' : errorCount > 0 ? 'warning' : 'healthy';

        setMetrics({
          notesOperations: notesOps,
          filesOperations: filesOps,
          summarizeOperations: 0, // Add if needed
          errors: errorCount,
          avgDuration: Math.round(avgDur),
          lastUpdated: new Date().toLocaleTimeString(),
          loading: false,
          health: health
        });
      } catch (error) {
        console.error('Error fetching CloudWatch metrics:', error);
        setMetrics(prev => ({ ...prev, loading: false, health: 'error' }));
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [cloudwatch]);

  const getHealthColor = (health) => {
    switch (health) {
      case 'healthy': return '#4CAF50';
      case 'warning': return '#FFC107';
      case 'degraded': return '#FF6B6B';
      case 'error': return '#9E9E9E';
      default: return '#2196F3';
    }
  };

  const getHealthLabel = (health) => {
    switch (health) {
      case 'healthy': return '✓ Healthy';
      case 'warning': return '⚠ Warning';
      case 'degraded': return '✗ Degraded';
      case 'error': return '? Unknown';
      default: return 'Unknown';
    }
  };

  return (
    <div className="monitoring-container">
      <div className="monitoring-header">
        <div>
          <h2>📊 System Monitoring Dashboard</h2>
          <p className="last-updated">Last updated: {metrics.lastUpdated || 'Loading...'}</p>
        </div>
        <button onClick={() => navigate('/')} className="back-to-dashboard-btn">
          ← Back to Dashboard
        </button>
      </div>

      {metrics.loading ? (
        <div className="loading">Loading metrics...</div>
      ) : (
        <div className="metrics-grid">
          {/* Health Status Card */}
          <div className="metric-card health-card" style={{ borderLeft: `4px solid ${getHealthColor(metrics.health)}` }}>
            <div className="metric-label">System Health</div>
            <div className="metric-value" style={{ color: getHealthColor(metrics.health) }}>
              {getHealthLabel(metrics.health)}
            </div>
          </div>

          {/* Notes Operations */}
          <div className="metric-card">
            <div className="metric-label">Notes Created</div>
            <div className="metric-value">{metrics.notesOperations}</div>
            <div className="metric-sublabel">(Last 1 hour)</div>
          </div>

          {/* Files Operations */}
          <div className="metric-card">
            <div className="metric-label">Files Uploaded</div>
            <div className="metric-value">{metrics.filesOperations}</div>
            <div className="metric-sublabel">(Last 1 hour)</div>
          </div>

          {/* Errors */}
          <div className="metric-card" style={{ borderLeft: metrics.errors > 0 ? '4px solid #FF6B6B' : '4px solid #4CAF50' }}>
            <div className="metric-label">Errors</div>
            <div className="metric-value" style={{ color: metrics.errors > 0 ? '#FF6B6B' : '#4CAF50' }}>
              {metrics.errors}
            </div>
            <div className="metric-sublabel">(Last 1 hour)</div>
          </div>

          {/* Average Duration */}
          <div className="metric-card">
            <div className="metric-label">Avg Response Time</div>
            <div className="metric-value">{metrics.avgDuration}ms</div>
            <div className="metric-sublabel">Lambda execution</div>
          </div>

          {/* Total Operations */}
          <div className="metric-card">
            <div className="metric-label">Total Operations</div>
            <div className="metric-value">
              {metrics.notesOperations + metrics.filesOperations + metrics.summarizeOperations}
            </div>
            <div className="metric-sublabel">(Last 1 hour)</div>
          </div>
        </div>
      )}

      {/* Detailed Metrics Info */}
      <div className="metrics-info">
        <h3>📈 Performance Metrics</h3>
        <ul>
          <li><strong>Notes API:</strong> {metrics.notesOperations} operations</li>
          <li><strong>Files API:</strong> {metrics.filesOperations} operations</li>
          <li><strong>Errors:</strong> {metrics.errors} {metrics.errors > 0 ? '⚠️' : '✓'}</li>
          <li><strong>Avg Response Time:</strong> {metrics.avgDuration}ms</li>
        </ul>
      </div>

      {/* CloudWatch Link */}
      <div className="cloudwatch-link">
        <a 
          href="https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#dashboards:"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Full CloudWatch Dashboard →
        </a>
      </div>
    </div>
  );
};

export default Monitoring;
