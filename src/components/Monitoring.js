import React, { useState, useEffect } from 'react';
import { CloudWatchClient, GetMetricStatisticsCommand, ListMetricsCommand } from "@aws-sdk/client-cloudwatch";
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

  // Fetch metrics from CloudWatch
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Initialize CloudWatch client with fresh credentials
        const session = await fetchAuthSession();
        console.log('Fetching CloudWatch metrics with credentials:', session.credentials ? 'Present' : 'Missing');
        
        const cwClient = new CloudWatchClient({
          region: 'ap-south-1',
          credentials: session.credentials
        });
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 3600000); // Last 1 hour

        // Helper function to get metrics with all dimension combinations
        const getMetricSum = async (namespace, metricName) => {
          try {
            // First, list all metrics to find dimension combinations
            const listCmd = new ListMetricsCommand({
              Namespace: namespace,
              MetricName: metricName
            });
            const listRes = await cwClient.send(listCmd);
            
            console.log(`Found ${listRes.Metrics?.length || 0} metric streams for ${metricName}`);
            
            if (!listRes.Metrics || listRes.Metrics.length === 0) {
              console.warn(`No metrics found for ${namespace}/${metricName}`);
              return 0;
            }

            // Query each unique metric stream and sum the results
            const queries = listRes.Metrics.map(metric => {
              return cwClient.send(new GetMetricStatisticsCommand({
                Namespace: namespace,
                MetricName: metricName,
                Dimensions: metric.Dimensions,
                StartTime: startTime,
                EndTime: endTime,
                Period: 3600, // 1 hour period to get all data
                Statistics: ['Sum']
              }));
            });

            const responses = await Promise.all(queries);
            const totalSum = responses.reduce((total, res) => {
              const sum = res.Datapoints?.reduce((s, dp) => s + (dp.Sum || 0), 0) || 0;
              return total + sum;
            }, 0);

            return totalSum;
          } catch (err) {
            console.error(`Error fetching ${namespace}/${metricName}:`, err);
            return 0;
          }
        };

        // Helper function to get average metric
        const getMetricAverage = async (namespace, metricName) => {
          try {
            const listCmd = new ListMetricsCommand({
              Namespace: namespace,
              MetricName: metricName
            });
            const listRes = await cwClient.send(listCmd);
            
            if (!listRes.Metrics || listRes.Metrics.length === 0) {
              return 0;
            }

            const queries = listRes.Metrics.map(metric => {
              return cwClient.send(new GetMetricStatisticsCommand({
                Namespace: namespace,
                MetricName: metricName,
                Dimensions: metric.Dimensions,
                StartTime: startTime,
                EndTime: endTime,
                Period: 3600,
                Statistics: ['Average']
              }));
            });

            const responses = await Promise.all(queries);
            let totalAvg = 0;
            let count = 0;
            
            responses.forEach(res => {
              res.Datapoints?.forEach(dp => {
                if (dp.Average) {
                  totalAvg += dp.Average;
                  count++;
                }
              });
            });

            return count > 0 ? totalAvg / count : 0;
          } catch (err) {
            console.error(`Error fetching ${namespace}/${metricName}:`, err);
            return 0;
          }
        };

        // Fetch all metrics
        const [notesOps, filesOps, errorCount, avgDur] = await Promise.all([
          getMetricSum('PersonalCloudAssistant/Notes', 'NotesCreated'),
          getMetricSum('PersonalCloudAssistant/Files', 'FilesUploaded'),
          getMetricSum('PersonalCloudAssistant/Notes', 'Errors'),
          getMetricAverage('PersonalCloudAssistant/Notes', 'RequestDuration')
        ]);

        console.log('Calculated Metrics:', {
          notesOps,
          filesOps,
          errorCount,
          avgDur
        });

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
        console.error('Error details:', {
          message: error.message,
          code: error.code || error.$metadata?.httpStatusCode,
          name: error.name
        });
        setMetrics(prev => ({ ...prev, loading: false, health: 'error' }));
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

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
    </div>
  );
};

export default Monitoring;
